'use client';

import { useState, useRef, useCallback } from 'react';
import { Product } from '@/lib/products';
import { fetchProducts, createProduct, updateProduct } from '@/lib/api';

export interface Detection {
  class_name: string;
  confidence: number;
  product_id?: string;
  product_name?: string;
  product_price?: number;
  match_source?: string;
  bbox?: number[];
}

export interface DetectionResponse {
  success: boolean;
  detections: Detection[];
  message: string;
  human_detected?: boolean;
  match_tier?: string;
  primary_product_id?: string;
  primary_product?: Product;
}

const DEFAULT_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
const EMBEDDING_STORAGE_KEY = 'proscan_visual_embeddings_v2';

// Singleton browser neural model (COCO-SSD via TFJS CDN) for cloud deployments (Render / Vercel)
let browserCocoModelPromise: Promise<any> | null = null;
let useBrowserEngineFallback = false;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('No document'));
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function getBrowserCocoModel(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).__proscanCocoModel) return (window as any).__proscanCocoModel;
  if (!browserCocoModelPromise) {
    browserCocoModelPromise = (async () => {
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
      const cocoSsd = (window as any).cocoSsd;
      if (!cocoSsd) throw new Error('COCO-SSD unavailable');
      const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      (window as any).__proscanCocoModel = model;
      return model;
    })();
  }
  return browserCocoModelPromise;
}

function getStoredEmbeddings(): Record<string, number[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(EMBEDDING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredEmbedding(productId: string, vec: number[]) {
  if (typeof window === 'undefined') return;
  try {
    const map = getStoredEmbeddings();
    map[productId] = vec;
    window.localStorage.setItem(EMBEDDING_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

async function decodeBase64ToImageElement(base64Image: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`;
  });
}

function computeCanvasVisualEmbedding(img: HTMLImageElement, cropBox?: [number, number, number, number]): number[] {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  if (cropBox) {
    const [sx, sy, sw, sh] = cropBox;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 64, 64);
  } else {
    // Center reticle (middle 60%)
    const sx = img.width * 0.2;
    const sy = img.height * 0.2;
    const sw = img.width * 0.6;
    const sh = img.height * 0.6;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 64, 64);
  }

  const data = ctx.getImageData(0, 0, 64, 64).data;
  // 2x2 spatial grid x 24 RGB/chrominance bins = 96 features
  const features: number[] = new Array(96).fill(0);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const idx = (y * 64 + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const quad = (y >= 32 ? 2 : 0) + (x >= 32 ? 1 : 0);
      const offset = quad * 24;
      features[offset + Math.min(7, Math.floor(r / 32))] += 1;
      features[offset + 8 + Math.min(7, Math.floor(g / 32))] += 1;
      features[offset + 16 + Math.min(7, Math.floor(b / 32))] += 1;
    }
  }
  const norm = Math.sqrt(features.reduce((acc, v) => acc + v * v, 0)) + 1e-6;
  return features.map((v) => Number((v / norm).toFixed(5)));
}

function cosineSim(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-6);
}

async function runBrowserHybridDetection(
  base64Image: string,
  confidence: number,
  barcodeHint?: string
): Promise<DetectionResponse> {
  const catalog = await fetchProducts();

  // Tier 1: Barcode Match
  if (barcodeHint) {
    const bcMatch = catalog.find((p) => p.barcode === barcodeHint || p.id === barcodeHint);
    if (bcMatch) {
      return {
        success: true,
        detections: [
          {
            class_name: `barcode:${barcodeHint}`,
            confidence: 1.0,
            product_id: bcMatch.id,
            product_name: bcMatch.name,
            product_price: bcMatch.price,
            match_source: 'barcode',
          },
        ],
        message: `Barcode match: ${bcMatch.name}`,
        human_detected: false,
        match_tier: 'Tier 1: Instant Barcode',
        primary_product_id: bcMatch.id,
        primary_product: bcMatch,
      };
    }
  }

  const img = await decodeBase64ToImageElement(base64Image);
  const model = await getBrowserCocoModel();
  const predictions: Array<{ bbox: [number, number, number, number]; class: string; score: number }> =
    model ? await model.detect(img) : [];

  const detections: Detection[] = [];
  let personDetected = false;

  // First pass: STRICT Human Person Gatekeeper
  for (const pred of predictions) {
    if (pred.class === 'person' && pred.score >= 0.40) {
      personDetected = true;
      const [x, y, w, h] = pred.bbox;
      detections.push({
        class_name: 'person',
        confidence: Number(pred.score.toFixed(4)),
        match_source: 'human_filter',
        bbox: [Math.round(x), Math.round(y), Math.round(x + w), Math.round(y + h)],
      });
    }
  }

  if (personDetected) {
    return {
      success: true,
      detections,
      message: 'human not valid',
      human_detected: true,
      match_tier: 'Safety Filter: Human Not Valid',
    };
  }

  const frameArea = img.width * img.height || 1;
  const embeddings = getStoredEmbeddings();
  let primaryProduct: Product | undefined;
  let bestConf = 0;
  let matchTier: string | undefined;

  // Second pass: Valid non-person objects inside reticle
  for (const pred of predictions) {
    if (pred.class === 'person') continue;
    const [x, y, w, h] = pred.bbox;
    const areaRatio = (w * h) / frameArea;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const inReticle = cx >= 0.12 * img.width && cx <= 0.88 * img.width && cy >= 0.12 * img.height && cy <= 0.88 * img.height;

    if (!inReticle || areaRatio < 0.035 || pred.score < Math.min(confidence, 0.52)) {
      continue;
    }

    const targetClass = pred.class.toLowerCase().trim();
    const matched = catalog.find((p) => {
      const classes = (p.yolo_classes || '')
        .split(',')
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean);
      return classes.includes(targetClass);
    });

    detections.push({
      class_name: pred.class,
      confidence: Number(pred.score.toFixed(4)),
      product_id: matched?.id,
      product_name: matched?.name,
      product_price: matched?.price,
      match_source: 'yolo',
      bbox: [Math.round(x), Math.round(y), Math.round(x + w), Math.round(y + h)],
    });

    if (matched && pred.score > bestConf) {
      bestConf = pred.score;
      primaryProduct = matched;
      matchTier = 'Tier 2: Neural Match';
    }
  }

  // Check Center Reticle against enrolled Visual Fingerprints
  if (!primaryProduct && Object.keys(embeddings).length > 0) {
    const queryVec = computeCanvasVisualEmbedding(img);
    let bestFpScore = 0;
    let bestFpProd: Product | undefined;
    for (const prod of catalog) {
      const storedVec = embeddings[prod.id];
      if (!storedVec) continue;
      const sim = cosineSim(queryVec, storedVec);
      if (sim > bestFpScore) {
        bestFpScore = sim;
        bestFpProd = prod;
      }
    }
    if (bestFpProd && bestFpScore >= 0.90) {
      primaryProduct = bestFpProd;
      matchTier = 'Tier 2: Visual Fingerprint';
      detections.unshift({
        class_name: 'enrolled_item',
        confidence: Number(bestFpScore.toFixed(4)),
        product_id: bestFpProd.id,
        product_name: bestFpProd.name,
        product_price: bestFpProd.price,
        match_source: 'visual_fingerprint',
      });
    }
  }

  return {
    success: true,
    detections,
    message: primaryProduct ? `Matched ${primaryProduct.name}` : `Detected ${detections.length} object(s)`,
    human_detected: false,
    match_tier: matchTier,
    primary_product_id: primaryProduct?.id,
    primary_product: primaryProduct,
  };
}

export function useBackendDetection(backendUrl: string = DEFAULT_BACKEND_URL) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDetection, setLastDetection] = useState<DetectionResponse | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const detectFromBase64 = useCallback(
    async (base64Image: string, confidence: number = 0.58, barcodeHint?: string) => {
      setIsLoading(true);
      setError(null);

      if (useBrowserEngineFallback) {
        try {
          const data = await runBrowserHybridDetection(base64Image, confidence, barcodeHint);
          setLastDetection(data);
          return data;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Detection error';
          setError(msg);
          return null;
        } finally {
          setIsLoading(false);
        }
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`${backendUrl}/detect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image: base64Image,
            confidence,
            barcode_hint: barcodeHint,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Backend error: ${response.statusText}`);
        }

        const data: DetectionResponse = await response.json();
        setLastDetection(data);
        return data;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return null;
        }
        // Seamlessly fall back to in-browser neural engine if backend is unreachable
        try {
          useBrowserEngineFallback = true;
          const fallbackData = await runBrowserHybridDetection(base64Image, confidence, barcodeHint);
          setLastDetection(fallbackData);
          return fallbackData;
        } catch {
          return null;
        }
      } finally {
        setIsLoading(false);
      }
    },
    [backendUrl]
  );

  const identifyWithCloudAI = useCallback(
    async (base64Image: string) => {
      setIsLoading(true);
      setError(null);
      try {
        if (!useBrowserEngineFallback) {
          const response = await fetch(`${backendUrl}/identify-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image, confidence: 0.3 }),
          });
          if (response.ok) {
            const data: DetectionResponse = await response.json();
            setLastDetection(data);
            return data;
          }
        }
        const data = await runBrowserHybridDetection(base64Image, 0.45);
        setLastDetection(data);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Cloud AI failed';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [backendUrl]
  );

  const enrollVisualProduct = useCallback(
    async (payload: {
      product_id?: string;
      name?: string;
      price?: number;
      category?: string;
      image_emoji?: string;
      barcode?: string;
      frame_base64: string;
    }): Promise<Product | null> => {
      try {
        if (!useBrowserEngineFallback) {
          const response = await fetch(`${backendUrl}/enroll-visual`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (response.ok) {
            return await response.json();
          }
        }

        // Browser-side Visual Fingerprint Enrollment
        const img = await decodeBase64ToImageElement(payload.frame_base64);
        const vec = computeCanvasVisualEmbedding(img);
        if (payload.product_id) {
          saveStoredEmbedding(payload.product_id, vec);
          const updated = await updateProduct(payload.product_id, { has_visual_fingerprint: true });
          return updated;
        } else if (payload.name && payload.price !== undefined) {
          const created = await createProduct({
            name: payload.name,
            price: payload.price,
            category: payload.category || 'General',
            image: payload.image_emoji || '📦',
            barcode: payload.barcode || String(Math.floor(100000000000 + Math.random() * 900000000000)),
            has_visual_fingerprint: true,
          });
          saveStoredEmbedding(created.id, vec);
          return created;
        }
        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Visual enrollment failed';
        setError(message);
        return null;
      }
    },
    [backendUrl]
  );

  const detectFromFile = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`${backendUrl}/detect-file`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Backend error: ${response.statusText}`);
        }

        const data: DetectionResponse = await response.json();
        setLastDetection(data);

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Detection failed';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [backendUrl]
  );

  const checkBackendHealth = useCallback(async () => {
    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isLocal || process.env.NEXT_PUBLIC_BACKEND_URL) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1800);
        const response = await fetch(`${backendUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (response.ok) {
          useBrowserEngineFallback = false;
          return true;
        }
      } catch {
        // Fall through to browser neural engine
      }
    }

    // Cloud deployment (Render / Vercel) or local without Python server: activate WebGL neural engine
    try {
      useBrowserEngineFallback = true;
      await getBrowserCocoModel();
      return true;
    } catch {
      // Even before CDN finishes, mark connected so camera starts immediately
      useBrowserEngineFallback = true;
      return true;
    }
  }, [backendUrl]);

  return {
    detectFromBase64,
    identifyWithCloudAI,
    enrollVisualProduct,
    detectFromFile,
    checkBackendHealth,
    isLoading,
    error,
    lastDetection,
  };
}
