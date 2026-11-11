"""
SQLite Database Module for Proscan
Stores catalog products, prices, barcodes, visual embeddings, and mappings to YOLO detection classes.
"""

import sqlite3
import os
from typing import Optional, List, Dict, Any

DB_PATH = os.path.join(os.path.dirname(__file__), "products.db")

INITIAL_PRODUCTS = [
    # Everyday real-world items detectable by standard YOLOv8 (COCO model)
    {
        "id": "prod-001",
        "name": "Spring Water Bottle",
        "price": 1.50,
        "image": "💧",
        "barcode": "123456789012",
        "category": "Beverages",
        "description": "500ml refreshing pure natural spring water",
        "yolo_classes": "bottle",
    },
    {
        "id": "prod-002",
        "name": "Fresh Red Apple",
        "price": 0.85,
        "image": "🍎",
        "barcode": "234567890123",
        "category": "Produce",
        "description": "Crisp and juicy sweet organic red apple",
        "yolo_classes": "apple",
    },
    {
        "id": "prod-003",
        "name": "Organic Banana",
        "price": 0.65,
        "image": "🍌",
        "barcode": "345678901234",
        "category": "Produce",
        "description": "Fresh ripe fair-trade Cavendish banana",
        "yolo_classes": "banana",
    },
    {
        "id": "prod-004",
        "name": "Ceramic Coffee Mug",
        "price": 4.99,
        "image": "☕",
        "barcode": "456789012345",
        "category": "Kitchenware",
        "description": "Premium 12oz ceramic coffee and tea mug",
        "yolo_classes": "cup,wine glass",
    },
    {
        "id": "prod-005",
        "name": "Fresh Valencia Orange",
        "price": 0.75,
        "image": "🍊",
        "barcode": "567890123456",
        "category": "Produce",
        "description": "Sweet and tangy citrus orange full of Vitamin C",
        "yolo_classes": "orange,sports ball",
    },
    {
        "id": "prod-006",
        "name": "Artisan Deli Sandwich",
        "price": 5.50,
        "image": "🥪",
        "barcode": "678901234567",
        "category": "Deli & Bakery",
        "description": "Freshly prepared club sandwich with cheese and greens",
        "yolo_classes": "sandwich,hot dog,pizza,donut,cake",
    },
    {
        "id": "prod-007",
        "name": "Hardcover Notebook",
        "price": 3.50,
        "image": "📓",
        "barcode": "789012345678",
        "category": "Stationery",
        "description": "160-page ruled notebook for notes and journaling",
        "yolo_classes": "book",
    },
    {
        "id": "prod-008",
        "name": "Smartphone Accessory Case",
        "price": 9.99,
        "image": "📱",
        "barcode": "890123456789",
        "category": "Electronics",
        "description": "Protective slim shock-resistant phone case",
        "yolo_classes": "cell phone,remote,mouse",
    },
    # Custom grocery items
    {
        "id": "prod-009",
        "name": "Hungryman Instant Noodles",
        "price": 1.20,
        "image": "🍜",
        "barcode": "901234567890",
        "category": "Food & Grocery",
        "description": "Delicious quick-cooking seasoned ramen noodles",
        "yolo_classes": "hungryman_noodles,bowl",
    },
    {
        "id": "prod-010",
        "name": "Premium Tomato Paste Sachet",
        "price": 0.50,
        "image": "🍅",
        "barcode": "012345678901",
        "category": "Condiments",
        "description": "Rich concentrated double-strength tomato purée",
        "yolo_classes": "tomato_sachet",
    },
    {
        "id": "prod-011",
        "name": "Cowbell Evaporated Milk",
        "price": 2.50,
        "image": "🥛",
        "barcode": "112233445566",
        "category": "Dairy",
        "description": "Creamy evaporated milk enriched with vitamins",
        "yolo_classes": "cowbell_milk",
    },
]

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Create the products table, run migrations, and seed with default supermarket inventory"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            image TEXT NOT NULL,
            barcode TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,
            description TEXT,
            yolo_classes TEXT NOT NULL,
            visual_embedding TEXT DEFAULT '',
            reference_image TEXT DEFAULT ''
        )
    """)
    
    # Migrate existing table if visual_embedding or reference_image columns are missing
    cursor.execute("PRAGMA table_info(products)")
    existing_cols = {row["name"] for row in cursor.fetchall()}
    if "visual_embedding" not in existing_cols:
        cursor.execute("ALTER TABLE products ADD COLUMN visual_embedding TEXT DEFAULT ''")
    if "reference_image" not in existing_cols:
        cursor.execute("ALTER TABLE products ADD COLUMN reference_image TEXT DEFAULT ''")
    conn.commit()
    
    # Check if table already has rows
    cursor.execute("SELECT COUNT(*) FROM products")
    count = cursor.fetchone()[0]
    
    if count == 0:
        print("[DB] Seeding SQLite database with supermarket catalog...")
        for p in INITIAL_PRODUCTS:
            cursor.execute("""
                INSERT INTO products (id, name, price, image, barcode, category, description, yolo_classes)
                VALUES (:id, :name, :price, :image, :barcode, :category, :description, :yolo_classes)
            """, p)
        conn.commit()
        print(f"[DB] Successfully seeded {len(INITIAL_PRODUCTS)} products into SQLite.")
    else:
        print(f"[DB] SQLite database ready with {count} products.")
        
    conn.close()

def _row_to_dict(r: sqlite3.Row, include_embedding: bool = False) -> Dict[str, Any]:
    d = dict(r)
    d["has_visual_fingerprint"] = bool(d.get("visual_embedding"))
    if not include_embedding:
        d.pop("visual_embedding", None)
    return d

def get_all_products(include_embeddings: bool = False) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, price, image, barcode, category, description, yolo_classes, visual_embedding, reference_image FROM products")
    rows = cursor.fetchall()
    conn.close()
    return [_row_to_dict(r, include_embedding=include_embeddings) for r in rows]

def get_product_by_id(product_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, price, image, barcode, category, description, yolo_classes, visual_embedding, reference_image FROM products WHERE id = ?", (product_id,))
    row = cursor.fetchone()
    conn.close()
    return _row_to_dict(row) if row else None

def get_product_by_barcode(barcode: str) -> Optional[Dict[str, Any]]:
    target = barcode.strip()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, price, image, barcode, category, description, yolo_classes, visual_embedding, reference_image FROM products WHERE barcode = ?", (target,))
    row = cursor.fetchone()
    conn.close()
    return _row_to_dict(row) if row else None

def get_product_by_name_fuzzy(name_query: str) -> Optional[Dict[str, Any]]:
    """Case-insensitive substring / token match against product name"""
    target = name_query.lower().strip()
    if not target:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, price, image, barcode, category, description, yolo_classes, visual_embedding, reference_image FROM products")
    rows = cursor.fetchall()
    conn.close()
    
    # 1. Exact case-insensitive match
    for r in rows:
        if r["name"].lower().strip() == target:
            return _row_to_dict(r)
    # 2. Substring match
    for r in rows:
        p_name = r["name"].lower()
        if target in p_name or p_name in target:
            return _row_to_dict(r)
    return None

def get_product_by_yolo_class(class_name: str) -> Optional[Dict[str, Any]]:
    """Lookup a product whose yolo_classes contains the detected class name"""
    target = class_name.lower().strip()
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, name, price, image, barcode, category, description, yolo_classes, visual_embedding, reference_image FROM products")
    rows = cursor.fetchall()
    conn.close()
    
    for r in rows:
        classes = [c.strip().lower() for c in r["yolo_classes"].split(",") if c.strip()]
        if target in classes:
            return _row_to_dict(r)
    return None

def save_product_embedding(product_id: str, embedding_json: str, reference_image: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Save a visual fingerprint vector for a product so it can be recognized instantly"""
    conn = get_connection()
    cursor = conn.cursor()
    if reference_image:
        cursor.execute(
            "UPDATE products SET visual_embedding = ?, reference_image = ? WHERE id = ?",
            (embedding_json, reference_image, product_id)
        )
    else:
        cursor.execute(
            "UPDATE products SET visual_embedding = ? WHERE id = ?",
            (embedding_json, product_id)
        )
    conn.commit()
    conn.close()
    return get_product_by_id(product_id)

def create_product(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new product record in SQLite"""
    import uuid
    conn = get_connection()
    cursor = conn.cursor()
    prod_id = data.get("id") or f"prod-{str(uuid.uuid4())[:8]}"
    barcode = data.get("barcode") or str(int(uuid.uuid4().int % 10**12)).zfill(12)
    
    cursor.execute("""
        INSERT INTO products (id, name, price, image, barcode, category, description, yolo_classes, visual_embedding, reference_image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        prod_id,
        data["name"],
        float(data["price"]),
        data.get("image", "📦"),
        barcode,
        data.get("category", "General"),
        data.get("description", ""),
        data.get("yolo_classes", "").lower().strip(),
        data.get("visual_embedding", ""),
        data.get("reference_image", "")
    ))
    conn.commit()
    conn.close()
    return get_product_by_id(prod_id)

def update_product(product_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update fields of an existing product in SQLite"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM products WHERE id = ?", (product_id,))
    if not cursor.fetchone():
        conn.close()
        return None
        
    fields = []
    values = []
    for k in ["name", "price", "image", "barcode", "category", "description", "yolo_classes", "visual_embedding", "reference_image"]:
        if k in data and data[k] is not None:
            fields.append(f"{k} = ?")
            values.append(float(data[k]) if k == "price" else data[k])
            
    if not fields:
        conn.close()
        return get_product_by_id(product_id)
        
    values.append(product_id)
    sql = f"UPDATE products SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(sql, values)
    conn.commit()
    conn.close()
    return get_product_by_id(product_id)

def delete_product(product_id: str) -> bool:
    """Delete a product from SQLite by ID"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

# Pre-defined COCO classes supported out-of-the-box by YOLOv8
COCO_CLASSES = [
    "bottle", "cup", "apple", "banana", "orange", "sandwich", "book", 
    "cell phone", "bowl", "scissors", "fork", "knife", "spoon", "laptop",
    "mouse", "keyboard", "tv", "microwave", "toaster", "sink", "refrigerator",
    "clock", "vase", "teddy bear", "toothbrush", "backpack", "umbrella", 
    "handbag", "wine glass", "sports ball", "hot dog", "pizza", "donut", "cake",
    "remote", "tie", "suitcase", "frisbee", "broccoli", "carrot"
]

if __name__ == "__main__":
    init_db()
