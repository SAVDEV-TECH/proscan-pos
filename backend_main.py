"""
Proscan Backend - 3-Tier Hybrid Product Detection Server
FastAPI backend combining:
  Tier 1: Instant Barcode / QR Lookup (<5ms)
  Tier 2: Strict Human Face & Person Gatekeeper + Reticle-Locked YOLOv8 & Visual Fingerprint (<35ms)
  Tier 3: Cloud VLM Catalog Matcher & 1-Click Visual Product Enrollment
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import base64
import json
import cv2
import numpy as np
from io import BytesIO
from PIL import Image
import uvicorn
import os
import urllib.request
import urllib.error
from dotenv import load_dotenv
from ultralytics import YOLO
import warnings

# SQLite Database Manager
import database

# Suppress PyTorch warnings about weights_only
warnings.filterwarnings('ignore')

# Fix PyTorch 2.6+ compatibility issue — must pass class objects, not strings
import torch
try:
    from ultralytics.nn.tasks import DetectionModel, SegmentationModel
    torch.serialization.add_safe_globals([DetectionModel, SegmentationModel])
except ImportError:
    pass

# Load environment variables from backend.env and fallback Mogshops .env
load_dotenv(dotenv_path="backend.env")
mogshops_env = r"C:\Users\savde\Documents\Project\Mogshops\.env"
if os.path.exists(mogshops_env):
    load_dotenv(dotenv_path=mogshops_env, override=False)

# Ensure SQLite database is created and seeded
database.init_db()

app = FastAPI(
    title="Proscan 3-Tier Hybrid Product Detection API",
    description="Market Square-speed POS product recognition using Barcode, YOLOv8, Visual Fingerprinting, and SQLite",
    version="2.1.0"
)

# CORS middleware
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Default confidence for valid product detection (high threshold to prevent false positives)
DEFAULT_CONFIDENCE = float(os.getenv("DETECTION_CONFIDENCE", 0.58))

# Load YOLO model
MODEL_PATH = os.getenv("YOLO_MODEL", "yolov8n.pt")
try:
    model = YOLO(MODEL_PATH)
    print(f"[YOLO] Model loaded successfully: {MODEL_PATH}")
except Exception as e:
    print(f"[YOLO] Warning: Could not load YOLO model: {e}")
    model = None

# Load OpenCV Frontal & Profile Face Cascades for strict human face rejection
try:
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    profile_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
except Exception:
    face_cascade = None
    profile_cascade = None

# OpenCV QR & Barcode detectors
qr_detector = cv2.QRCodeDetector()
try:
    barcode_detector = cv2.barcode.BarcodeDetector()
except Exception:
    barcode_detector = None


# ==================== VISUAL FINGERPRINT ENGINE ====================

def compute_visual_embedding(img_bgr: np.ndarray) -> List[float]:
    """
    Compute a fast, lighting-resilient 160-D visual feature vector from a cropped product ROI.
    """
    resized = cv2.resize(img_bgr, (128, 128), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(resized, cv2.COLOR_BGR2LAB)

    features: List[float] = []

    # 1. 2x2 Spatial Grid HSV Histogram (4 quadrants x 24 dims = 96 dims)
    h_step, w_step = 64, 64
    for r in range(2):
        for c in range(2):
            patch = hsv[r * h_step:(r + 1) * h_step, c * w_step:(c + 1) * w_step]
            hist_h = cv2.calcHist([patch], [0], None, [12], [0, 180]).flatten()
            hist_s = cv2.calcHist([patch], [1], None, [6], [0, 256]).flatten()
            hist_v = cv2.calcHist([patch], [2], None, [6], [0, 256]).flatten()
            patch_vec = np.concatenate([hist_h, hist_s, hist_v])
            norm = np.linalg.norm(patch_vec) + 1e-6
            features.extend((patch_vec / norm).tolist())

    # 2. Center Core LAB Color Histogram (48 dims)
    center_lab = lab[20:108, 20:108]
    hist_l = cv2.calcHist([center_lab], [0], None, [12], [0, 256]).flatten()
    hist_a = cv2.calcHist([center_lab], [1], None, [18], [0, 256]).flatten()
    hist_b = cv2.calcHist([center_lab], [2], None, [18], [0, 256]).flatten()
    lab_vec = np.concatenate([hist_l, hist_a, hist_b])
    lab_vec = lab_vec / (np.linalg.norm(lab_vec) + 1e-6)
    features.extend(lab_vec.tolist())

    # 3. Edge Orientation & Texture Density (16 dims)
    gray = cv2.cvtColor(resized[16:112, 16:112], cv2.COLOR_BGR2GRAY)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    mag, ang = cv2.cartToPolar(gx, gy, angleInDegrees=True)
    bins = np.linspace(0, 360, 17)
    edge_hist, _ = np.histogram(ang, bins=bins, weights=mag)
    edge_hist = edge_hist / (np.linalg.norm(edge_hist) + 1e-6)
    features.extend(edge_hist.tolist())

    vec = np.array(features, dtype=np.float32)
    vec = vec / (np.linalg.norm(vec) + 1e-6)
    return [round(float(x), 5) for x in vec]


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-6
    return float(np.dot(a, b) / denom)


def match_visual_fingerprint(roi_bgr: np.ndarray, threshold: float = 0.88) -> Optional[tuple[Dict[str, Any], float]]:
    """Compare ROI visual embedding against all enrolled products in SQLite"""
    query_vec = compute_visual_embedding(roi_bgr)
    all_products = database.get_all_products(include_embeddings=True)
    best_product = None
    best_score = 0.0

    for prod in all_products:
        emb_str = prod.get("visual_embedding")
        if not emb_str:
            continue
        try:
            stored_vec = json.loads(emb_str)
            score = cosine_similarity(query_vec, stored_vec)
            if score > best_score:
                best_score = score
                best_product = prod
        except Exception:
            continue

    if best_product and best_score >= threshold:
        clean_prod = {k: v for k, v in best_product.items() if k != "visual_embedding"}
        return clean_prod, best_score
    return None


def decode_barcode_from_cv2(image_bgr: np.ndarray) -> Optional[str]:
    """Attempt fast 1D/2D barcode or QR detection from OpenCV frame"""
    try:
        if barcode_detector is not None:
            retval, decoded_info, _ = barcode_detector.detectAndDecode(image_bgr)
            if retval and decoded_info:
                for code in decoded_info:
                    if code and len(code.strip()) >= 4:
                        return code.strip()
    except Exception:
        pass

    try:
        data, _, _ = qr_detector.detectAndDecode(image_bgr)
        if data and len(data.strip()) >= 3:
            return data.strip()
    except Exception:
        pass
    return None


def extract_center_roi(image_bgr: np.ndarray) -> np.ndarray:
    """Extract the central viewfinder reticle region (middle 55% of frame)"""
    h, w = image_bgr.shape[:2]
    y1, y2 = int(h * 0.20), int(h * 0.80)
    x1, x2 = int(w * 0.20), int(w * 0.80)
    return image_bgr[y1:y2, x1:x2]


def detect_human_face_in_frame(image_bgr: np.ndarray) -> bool:
    """Detect if a human face (frontal or profile) is visible in the frame"""
    if face_cascade is None:
        return False
    try:
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=4, minSize=(45, 45))
        if len(faces) > 0:
            return True
        if profile_cascade is not None:
            profiles = profile_cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=4, minSize=(45, 45))
            if len(profiles) > 0:
                return True
    except Exception:
        pass
    return False


# ==================== REQUEST / RESPONSE MODELS ====================

class DetectionRequest(BaseModel):
    """Base64 encoded image for detection"""
    image: str
    confidence: float = DEFAULT_CONFIDENCE
    barcode_hint: Optional[str] = None

class Detection(BaseModel):
    """Single detection result"""
    class_name: str
    confidence: float
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    product_price: Optional[float] = None
    match_source: Optional[str] = None
    bbox: Optional[List[int]] = None

class ProductInfo(BaseModel):
    """Full product payload retrieved from SQLite"""
    id: str
    name: str
    price: float
    image: str
    barcode: str
    category: str
    description: Optional[str] = None
    yolo_classes: Optional[str] = None
    has_visual_fingerprint: Optional[bool] = False
    reference_image: Optional[str] = None

class ProductCreate(BaseModel):
    """Payload to create a new product dynamically"""
    name: str
    price: float
    image: Optional[str] = "📦"
    barcode: Optional[str] = None
    category: Optional[str] = "General"
    description: Optional[str] = ""
    yolo_classes: Optional[str] = ""
    frame_base64: Optional[str] = None

class ProductUpdate(BaseModel):
    """Payload to update an existing product"""
    name: Optional[str] = None
    price: Optional[float] = None
    image: Optional[str] = None
    barcode: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    yolo_classes: Optional[str] = None
    frame_base64: Optional[str] = None

class EnrollVisualRequest(BaseModel):
    """Payload to enroll/train a product's visual fingerprint from the live camera"""
    product_id: Optional[str] = None
    name: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = "General"
    image_emoji: Optional[str] = "📦"
    barcode: Optional[str] = None
    frame_base64: str

class DetectionResponse(BaseModel):
    """Detection response containing detections and resolved database product"""
    success: bool
    detections: list[Detection]
    message: str
    human_detected: bool = False
    match_tier: Optional[str] = None
    primary_product_id: Optional[str] = None
    primary_product: Optional[ProductInfo] = None

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    model_loaded: bool
    database_connected: bool
    version: str


# ==================== HELPER FUNCTIONS ====================

def base64_to_cv2(base64_string: str) -> Optional[np.ndarray]:
    """Convert base64 string to OpenCV BGR image"""
    try:
        if "," in base64_string:
            base64_string = base64_string.split(",")[1]
        image_data = base64.b64decode(base64_string)
        image = Image.open(BytesIO(image_data)).convert("RGB")
        return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    except Exception as e:
        print(f"[ERROR] base64 decode failed: {e}")
        return None


def make_thumbnail_data_url(roi_bgr: np.ndarray) -> str:
    """Create a compact 96x96 JPEG data URL thumbnail of the trained product"""
    thumb = cv2.resize(roi_bgr, (96, 96), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    if not ok:
        return ""
    b64 = base64.b64encode(buf.tobytes()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


# ==================== API ENDPOINTS ====================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint verifying model and SQLite status"""
    products = database.get_all_products()
    return HealthResponse(
        status="healthy",
        model_loaded=model is not None,
        database_connected=len(products) > 0,
        version="2.1.0"
    )

@app.get("/products")
async def list_products():
    """List all products stored in the SQLite database"""
    return database.get_all_products()

@app.get("/products/{product_id}")
async def get_product(product_id: str):
    """Fetch single product from SQLite by ID"""
    product = database.get_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@app.get("/barcode/{barcode}")
async def lookup_barcode_endpoint(barcode: str):
    """Instant Tier-1 Barcode lookup in SQLite"""
    product = database.get_product_by_barcode(barcode) or database.get_product_by_id(barcode)
    if not product:
        raise HTTPException(status_code=404, detail="Barcode not in catalog")
    return ProductInfo(**product)

@app.post("/products", response_model=ProductInfo, status_code=201)
async def create_new_product(payload: ProductCreate):
    """Create a new product dynamically in SQLite"""
    try:
        data = payload.model_dump()
        frame_b64 = data.pop("frame_base64", None)
        if frame_b64:
            img = base64_to_cv2(frame_b64)
            if img is not None:
                roi = extract_center_roi(img)
                data["visual_embedding"] = json.dumps(compute_visual_embedding(roi))
                data["reference_image"] = make_thumbnail_data_url(roi)
        created = database.create_product(data)
        return created
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create product: {str(e)}")

@app.put("/products/{product_id}", response_model=ProductInfo)
async def update_existing_product(product_id: str, payload: ProductUpdate):
    """Update an existing product's price, details, or visual fingerprint"""
    try:
        data = payload.model_dump(exclude_unset=True)
        frame_b64 = data.pop("frame_base64", None)
        if frame_b64:
            img = base64_to_cv2(frame_b64)
            if img is not None:
                roi = extract_center_roi(img)
                data["visual_embedding"] = json.dumps(compute_visual_embedding(roi))
                data["reference_image"] = make_thumbnail_data_url(roi)
        updated = database.update_product(product_id, data)
        if not updated:
            raise HTTPException(status_code=404, detail="Product not found")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update product: {str(e)}")

@app.post("/enroll-visual", response_model=ProductInfo)
async def enroll_product_visual(payload: EnrollVisualRequest):
    """
    1-Click Visual Training: Captures the item currently in the camera viewfinder,
    extracts its visual fingerprint, and binds it to an existing or new product in SQLite.
    """
    img = base64_to_cv2(payload.frame_base64)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid camera frame")

    if detect_human_face_in_frame(img):
        raise HTTPException(status_code=400, detail="Human face detected! Hold only the product in the camera box.")

    roi = extract_center_roi(img)
    detected_yolo_class = ""
    if model is not None:
        results = model(img, conf=0.45, verbose=False)
        if results and len(results) > 0:
            best_area = 0
            for box in results[0].boxes:
                cls_name = model.names[int(box.cls.item())]
                if cls_name == "person":
                    continue
                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                area = max(0, x2 - x1) * max(0, y2 - y1)
                if area > best_area and (x2 - x1) > 30 and (y2 - y1) > 30:
                    best_area = area
                    roi = img[max(0, y1):min(img.shape[0], y2), max(0, x1):min(img.shape[1], x2)]
                    detected_yolo_class = cls_name

    emb_json = json.dumps(compute_visual_embedding(roi))
    thumb_url = make_thumbnail_data_url(roi)

    if payload.product_id:
        existing = database.get_product_by_id(payload.product_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Product not found")
        updated = database.save_product_embedding(payload.product_id, emb_json, thumb_url)
        return ProductInfo(**updated)
    else:
        if not payload.name or payload.price is None:
            raise HTTPException(status_code=400, detail="Provide either product_id or name and price")
        created = database.create_product({
            "name": payload.name,
            "price": float(payload.price),
            "category": payload.category or "General",
            "image": payload.image_emoji or "📦",
            "barcode": payload.barcode,
            "yolo_classes": detected_yolo_class,
            "visual_embedding": emb_json,
            "reference_image": thumb_url,
            "description": "Visually enrolled via Proscan Camera"
        })
        return ProductInfo(**created)

@app.delete("/products/{product_id}")
async def delete_existing_product(product_id: str):
    """Delete a product from the database"""
    success = database.delete_product(product_id)
    if not success:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"success": True, "message": f"Product {product_id} deleted successfully"}

@app.get("/classes")
async def list_yolo_classes():
    """List all supported YOLO object classes available for detection mapping"""
    return {"classes": database.COCO_CLASSES}

@app.post("/detect", response_model=DetectionResponse)
async def detect_products(request: DetectionRequest):
    """
    3-Tier Hybrid Detection Pipeline with STRICT Human Face & Person Priority Gate:
      1. Tier 1: Instant Barcode / QR code match (<5ms)
      2. Strict Human Face Gate: If a human face or person is showing on camera, IMMEDIATELY reject ("human not valid")
      3. Tier 2: Reticle-Locked YOLOv8 + Visual Fingerprint match (<35ms)
    """
    try:
        if model is None:
            raise HTTPException(status_code=503, detail="Model not loaded")
        
        image = base64_to_cv2(request.image)
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image format")
        
        img_h, img_w = image.shape[:2]
        frame_area = float(img_h * img_w)

        # ---------------- TIER 1: BARCODE / QR MATCH ----------------
        barcode_candidate = request.barcode_hint or decode_barcode_from_cv2(image)
        if barcode_candidate:
            bc_prod = database.get_product_by_barcode(barcode_candidate) or database.get_product_by_id(barcode_candidate)
            if bc_prod:
                return DetectionResponse(
                    success=True,
                    detections=[Detection(
                        class_name=f"barcode:{barcode_candidate}",
                        confidence=1.0,
                        product_id=bc_prod["id"],
                        product_name=bc_prod["name"],
                        product_price=bc_prod["price"],
                        match_source="barcode"
                    )],
                    message=f"Barcode match: {bc_prod['name']}",
                    human_detected=False,
                    match_tier="Tier 1: Instant Barcode",
                    primary_product_id=bc_prod["id"],
                    primary_product=ProductInfo(**bc_prod)
                )

        # ---------------- STRICT HUMAN FACE CHECK FIRST ----------------
        face_visible = detect_human_face_in_frame(image)
        if face_visible:
            return DetectionResponse(
                success=True,
                detections=[Detection(
                    class_name="person",
                    confidence=0.99,
                    match_source="human_face_filter"
                )],
                message="human not valid",
                human_detected=True,
                match_tier="Safety Filter: Human Face Blocked",
                primary_product_id=None,
                primary_product=None
            )

        # ---------------- TIER 2: YOLOv8 + PERSON GATEKEEPER ----------------
        results = model(image, conf=0.35, verbose=False)
        detections: List[Detection] = []
        primary_product_id: Optional[str] = None
        primary_product: Optional[ProductInfo] = None
        best_confidence = 0.0
        match_tier: Optional[str] = None
        person_detected = False
        person_conf = 0.0

        if results and len(results) > 0:
            boxes = results[0].boxes
            
            # First pass: Check if a person is visible in the frame
            for box in boxes:
                cls_name = model.names[int(box.cls.item())]
                conf = float(box.conf.item())
                if cls_name == "person" and conf >= 0.40:
                    person_detected = True
                    person_conf = max(person_conf, conf)
                    x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                    detections.append(Detection(
                        class_name="person",
                        confidence=round(conf, 4),
                        match_source="human_filter",
                        bbox=[x1, y1, x2, y2]
                    ))

            # If a person is showing on the camera, IMMEDIATELY reject and do NOT allow background false-positives!
            if person_detected:
                return DetectionResponse(
                    success=True,
                    detections=detections,
                    message="human not valid",
                    human_detected=True,
                    match_tier="Safety Filter: Human Not Valid",
                    primary_product_id=None,
                    primary_product=None
                )

            # Second pass (only when NO human is on camera): evaluate valid products inside the reticle
            for box in boxes:
                class_id = int(box.cls.item())
                class_name = model.names[class_id]
                confidence = float(box.conf.item())
                if class_name == "person":
                    continue

                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                box_w = max(0, x2 - x1)
                box_h = max(0, y2 - y1)
                box_area_ratio = (box_w * box_h) / frame_area
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0

                # Must be reasonably sized (>= 3.5% of frame) and centered in the scanner reticle (middle 75% of view)
                in_reticle = (0.12 * img_w <= cx <= 0.88 * img_w) and (0.12 * img_h <= cy <= 0.88 * img_h)
                if not in_reticle or box_area_ratio < 0.035 or confidence < 0.55:
                    continue

                product_data = None
                source = "yolo"

                # Check if this object box matches an enrolled Visual Fingerprint
                crop = image[max(0, y1):min(img_h, y2), max(0, x1):min(img_w, x2)]
                fp_match = match_visual_fingerprint(crop, threshold=0.88)
                if fp_match:
                    product_data, fp_score = fp_match
                    confidence = max(confidence, fp_score)
                    source = "visual_fingerprint"

                if not product_data:
                    product_data = database.get_product_by_yolo_class(class_name)

                prod_id = product_data["id"] if product_data else None
                prod_name = product_data["name"] if product_data else None
                prod_price = product_data["price"] if product_data else None
                
                detection = Detection(
                    class_name=class_name,
                    confidence=round(confidence, 4),
                    product_id=prod_id,
                    product_name=prod_name,
                    product_price=prod_price,
                    match_source=source,
                    bbox=[x1, y1, x2, y2]
                )
                detections.append(detection)
                
                if product_data and confidence > best_confidence:
                    best_confidence = confidence
                    primary_product_id = prod_id
                    primary_product = ProductInfo(**product_data)
                    match_tier = "Tier 2: Visual Fingerprint" if source == "visual_fingerprint" else "Tier 2: YOLOv8 Neural Match"

        # Check Center Reticle against enrolled Visual Fingerprints ONLY when no human is present
        if primary_product is None and not person_detected:
            center_roi = extract_center_roi(image)
            fp_center = match_visual_fingerprint(center_roi, threshold=0.90)
            if fp_center:
                product_data, fp_score = fp_center
                primary_product_id = product_data["id"]
                primary_product = ProductInfo(**product_data)
                match_tier = "Tier 2: Visual Fingerprint (Reticle)"
                detections.insert(0, Detection(
                    class_name="enrolled_item",
                    confidence=round(fp_score, 4),
                    product_id=product_data["id"],
                    product_name=product_data["name"],
                    product_price=product_data["price"],
                    match_source="visual_fingerprint"
                ))
        
        return DetectionResponse(
            success=True,
            detections=detections,
            message=f"Matched {primary_product.name}" if primary_product else f"Detected {len(detections)} object(s)",
            human_detected=False,
            match_tier=match_tier,
            primary_product_id=primary_product_id,
            primary_product=primary_product
        )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Detection failed: {e}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@app.post("/identify-ai", response_model=DetectionResponse)
async def identify_with_cloud_ai(request: DetectionRequest):
    """
    Tier 3: Cloud VLM (Gemini 2.5 Flash) Catalog Matcher.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("NEXT_PUBLIC_GEMINI_API_KEY")
    image = base64_to_cv2(request.image)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image format")

    if detect_human_face_in_frame(image):
        return DetectionResponse(
            success=True,
            detections=[],
            message="human not valid",
            human_detected=True,
            match_tier="Safety Filter: Human Face Blocked"
        )

    if not api_key:
        return await detect_products(DetectionRequest(image=request.image, confidence=0.55))

    catalog = database.get_all_products()
    catalog_summary = [
        {"id": p["id"], "name": p["name"], "price": p["price"], "category": p["category"]}
        for p in catalog
    ]

    b64_clean = request.image.split(",")[1] if "," in request.image else request.image
    prompt = (
        "You are a high-speed supermarket POS optical scanner. "
        "1. If the image shows a human face or person, return ONLY: {\"error\": \"human not valid\"}. "
        f"2. Otherwise, identify the retail product shown and match it to our store database catalog if possible: {json.dumps(catalog_summary)}. "
        "Return ONLY valid JSON with keys: {\"matched_id\": \"prod-...\" or null, \"name\": \"Product Name\", \"estimated_price\": 1.50, \"category\": \"Category\", \"emoji\": \"📦\"}."
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": "image/jpeg", "data": b64_clean}}
            ]
        }],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1}
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
        text = resp_data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)

        if parsed.get("error") == "human not valid":
            return DetectionResponse(
                success=True,
                detections=[],
                message="human not valid",
                human_detected=True,
                match_tier="Tier 3: Gemini Human Filter"
            )

        matched_prod = None
        if parsed.get("matched_id"):
            matched_prod = database.get_product_by_id(parsed["matched_id"])
        if not matched_prod and parsed.get("name"):
            matched_prod = database.get_product_by_name_fuzzy(parsed["name"])

        if matched_prod:
            roi = extract_center_roi(image)
            database.save_product_embedding(
                matched_prod["id"],
                json.dumps(compute_visual_embedding(roi)),
                make_thumbnail_data_url(roi)
            )
            matched_prod = database.get_product_by_id(matched_prod["id"])
            return DetectionResponse(
                success=True,
                detections=[Detection(
                    class_name=matched_prod["name"],
                    confidence=0.99,
                    product_id=matched_prod["id"],
                    product_name=matched_prod["name"],
                    product_price=matched_prod["price"],
                    match_source="gemini_ai"
                )],
                message=f"Cloud AI Matched: {matched_prod['name']}",
                human_detected=False,
                match_tier="Tier 3: Cloud AI + Auto-Fingerprinted",
                primary_product_id=matched_prod["id"],
                primary_product=ProductInfo(**matched_prod)
            )
    except Exception as e:
        print(f"[Tier 3 AI Warning] {e}")

    return await detect_products(DetectionRequest(image=request.image, confidence=0.55))


@app.post("/detect-file")
async def detect_from_file(file: UploadFile = File(...)):
    """Alternative endpoint that accepts image file upload"""
    contents = await file.read()
    b64 = base64.b64encode(contents).decode("utf-8")
    return await detect_products(DetectionRequest(image=b64, confidence=DEFAULT_CONFIDENCE))


@app.get("/models")
async def list_models():
    """List available YOLO models"""
    return {
        "models": ["yolov8n.pt", "yolov8s.pt", "yolov8m.pt"],
        "current": MODEL_PATH
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", os.getenv("BACKEND_PORT", 8000)))
    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    
    print(f"[SERVER] Starting Proscan 3-Tier Hybrid Backend on {host}:{port}")
    print(f"[SERVER] API Docs available at: http://{host}:{port}/docs")
    
    uvicorn.run(app, host=host, port=port, reload=False)
