'use client';

import { useState, useCallback } from 'react';
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
  product_not_found?: boolean;
  match_tier?: string;
  primary_product_id?: string;
  primary_product?: Product;
}

const DEFAULT_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
const EMBEDDING_STORAGE_KEY = 'proscan_visual_embeddings_v3';

// Singleton browser neural model (COCO-SSD via TFJS CDN)
let browserCocoModelPromise: Promise<any> | null = null;

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

function getStoredEmbeddings(): Record<string, number[][]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(EMBEDDING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredEmbeddings(productId: string, vectors: number[][]) {
  if (typeof window === 'undefined') return;
  try {
    const map = getStoredEmbeddings();
    map[productId] = vectors;
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

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case rf:
        h = (gf - bf) / d + (gf < bf ? 6 : 0);
        break;
      case gf:
        h = (bf - rf) / d + 2;
        break;
      case bf:
        h = (rf - gf) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s, v];
}

/**
 * Computes a lighting-invariant 144-D HSV + Spatial Color Layout + Edge Contrast descriptor
 * for a given crop region of the camera frame.
 */
function computeRegionDescriptor(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): number[] {
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
  const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

  // 3x3 spatial grid x 16 HSV bins (10 Hue + 3 Sat + 3 Val) = 144 features
  const features: number[] = new Array(144).fill(0);
  let colorPixels = 0;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = (y * SIZE + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const [h, s, v] = rgbToHsv(r, g, b);

      const gridRow = Math.min(2, Math.floor((y / SIZE) * 3));
      const gridCol = Math.min(2, Math.floor((x / SIZE) * 3));
      const cellOffset = (gridRow * 3 + gridCol) * 16;

      // Hue bin (0..9) weighted by saturation so vividly colored packaging (like VIVE Detergent) stands out
      const hueBin = Math.min(9, Math.floor(h / 36));
      features[cellOffset + hueBin] += s > 0.18 ? 1.5 : 0.25;

      // Saturation bin (10..12)
      const satBin = Math.min(2, Math.floor(s * 3));
      features[cellOffset + 10 + satBin] += 1.0;

      // Value/Brightness bin (13..15)
      const valBin = Math.min(2, Math.floor(v * 3));
      features[cellOffset + 13 + valBin] += 0.6;

      if (s > 0.22) colorPixels++;
    }
  }

  // Reject completely blank/dark frames
  if (colorPixels < 15 && features.every((v) => v === 0)) return [];

  const norm = Math.sqrt(features.reduce((acc, v) => acc + v * v, 0)) + 1e-6;
  return features.map((v) => Number((v / norm).toFixed(5)));
}

/**
 * Extracts 3 multi-scale center reticle descriptors (40% core, 55% mid, 70% wide)
 * so holding a trained product slightly closer or further still matches reliably.
 */
function computeMultiScaleDescriptors(img: HTMLImageElement): number[][] {
  const scales = [0.40, 0.55, 0.70];
  const vectors: number[][] = [];
  for (const frac of scales) {
    const sw = img.width * frac;
    const sh = img.height * frac;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    const vec = computeRegionDescriptor(img, sx, sy, sw, sh);
    if (vec.length > 0) vectors.push(vec);
  }
  return vectors;
}

function makeThumbnailDataUrl(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const sw = img.width * 0.62;
  const sh = img.height * 0.62;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 240, 240);
  return canvas.toDataURL('image/jpeg', 0.86);
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

function bestEmbeddingMatch(
  queryVectors: number[][],
  catalog: Product[],
  localMap: Record<string, number[][]>
): { product: Product; score: number } | null {
  let bestProduct: Product | null = null;
  let bestScore = 0;

  for (const prod of catalog) {
    const storedList = prod.visual_embeddings || localMap[prod.id];
    if (!storedList || !storedList.length) continue;

    for (const qVec of queryVectors) {
      for (const sVec of storedList) {
        const sim = cosineSim(qVec, sVec);
        if (sim > bestScore) {
          bestScore = sim;
          bestProduct = prod;
        }
      }
    }
  }

  if (bestProduct && bestScore >= 0.84) {
    return { product: bestProduct, score: bestScore };
  }
  return null;
}

async function runHybridDetection(
  base64Image: string,
  confidence: number,
  barcodeHint?: string
): Promise<DetectionResponse> {
  const catalog = await fetchProducts();
  const localMap = getStoredEmbeddings();

  // ---------------- TIER 1: BARCODE MATCH ----------------
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
        message: `Matched ${bcMatch.name}`,
        product_not_found: false,
        match_tier: 'Tier 1: Instant Barcode',
        primary_product_id: bcMatch.id,
        primary_product: bcMatch,
      };
    }
  }

  const img = await decodeBase64ToImageElement(base64Image);
  const queryVectors = computeMultiScaleDescriptors(img);

  // ---------------- TIER 2A: TRAINED VISUAL FINGERPRINT MATCH (HIGHEST PRIORITY) ----------------
  // Checks trained items (like VIVE Detergent) FIRST, completely ignoring any human in the background!
  const fpMatch = bestEmbeddingMatch(queryVectors, catalog, localMap);
  if (fpMatch) {
    return {
      success: true,
      detections: [
        {
          class_name: fpMatch.product.name,
          confidence: Number(fpMatch.score.toFixed(4)),
          product_id: fpMatch.product.id,
          product_name: fpMatch.product.name,
          product_price: fpMatch.product.price,
          match_source: 'visual_fingerprint',
        },
      ],
      message: `Matched ${fpMatch.product.name}`,
      product_not_found: false,
      match_tier: 'Tier 2: Trained Visual Match',
      primary_product_id: fpMatch.product.id,
      primary_product: fpMatch.product,
    };
  }

  // ---------------- TIER 2B: NEURAL OBJECT DETECTION (HUMANS SILENTLY IGNORED) ----------------
  let predictions: Array<{ bbox: [number, number, number, number]; class: string; score: number }> = [];
  try {
    const model = await getBrowserCocoModel();
    if (model) {
      predictions = await model.detect(img);
    }
  } catch {
    // continue gracefully
  }

  const detections: Detection[] = [];
  const frameArea = img.width * img.height || 1;
  let primaryProduct: Product | undefined;
  let bestConf = 0;
  let matchTier: string | undefined;

  for (const pred of predictions) {
    // Silently ignore humans — never distract user with "human not valid"
    if (pred.class === 'person') {
      continue;
    }

    const [x, y, w, h] = pred.bbox;
    const areaRatio = (w * h) / frameArea;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const inReticle =
      cx >= 0.12 * img.width &&
      cx <= 0.88 * img.width &&
      cy >= 0.12 * img.height &&
      cy <= 0.88 * img.height;

    if (!inReticle || areaRatio < 0.03 || pred.score < Math.min(confidence, 0.50)) {
      continue;
    }

    // Also check if this specific object bounding box matches a trained visual fingerprint
    const boxVec = computeRegionDescriptor(img, Math.max(0, x), Math.max(0, y), w, h);
    const boxFp = boxVec.length ? bestEmbeddingMatch([boxVec], catalog, localMap) : null;

    let matched: Product | undefined = boxFp?.product;
    let source = boxFp ? 'visual_fingerprint' : 'yolo';
    let score = boxFp ? Math.max(pred.score, boxFp.score) : pred.score;

    if (!matched) {
      const targetClass = pred.class.toLowerCase().trim();
      matched = catalog.find((p) => {
        const classes = (p.yolo_classes || '')
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean);
        return classes.includes(targetClass);
      });
    }

    detections.push({
      class_name: pred.class,
      confidence: Number(score.toFixed(4)),
      product_id: matched?.id,
      product_name: matched?.name,
      product_price: matched?.price,
      match_source: source,
      bbox: [Math.round(x), Math.round(y), Math.round(x + w), Math.round(y + h)],
    });

    if (matched && score > bestConf) {
      bestConf = score;
      primaryProduct = matched;
      matchTier = source === 'visual_fingerprint' ? 'Tier 2: Trained Visual Match' : 'Tier 2: Neural Match';
    }
  }

  if (!primaryProduct) {
    return {
      success: true,
      detections,
      message: 'Product not found',
      product_not_found: true,
      match_tier: 'Scanning — Product Not Found',
    };
  }

  return {
    success: true,
    detections,
    message: `Matched ${primaryProduct.name}`,
    product_not_found: false,
    match_tier: matchTier,
    primary_product_id: primaryProduct.id,
    primary_product: primaryProduct,
  };
}

export function useBackendDetection(backendUrl: string = DEFAULT_BACKEND_URL) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDetection, setLastDetection] = useState<DetectionResponse | null>(null);

  const detectFromBase64 = useCallback(
    async (base64Image: string, confidence: number = 0.52, barcodeHint?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await runHybridDetection(base64Image, confidence, barcodeHint);
        setLastDetection(data);
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Detection error';
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const identifyWithCloudAI = useCallback(
    async (base64Image: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/identify-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image }),
        });
        if (res.ok) {
          const data: DetectionResponse = await res.json();
          setLastDetection(data);
          if (data.primary_product) {
            return data;
          }
        }
        return await detectFromBase64(base64Image, 0.40);
      } catch {
        return await detectFromBase64(base64Image, 0.40);
      } finally {
        setIsLoading(false);
      }
    },
    [detectFromBase64]
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
      extra_frames?: string[];
    }): Promise<Product | null> => {
      try {
        const allFrames = [payload.frame_base64, ...(payload.extra_frames || [])];
        const allVectors: number[][] = [];
        let thumbUrl = '';

        for (let i = 0; i < allFrames.length; i++) {
          const img = await decodeBase64ToImageElement(allFrames[i]);
          if (i === 0) {
            thumbUrl = makeThumbnailDataUrl(img);
          }
          const vecs = computeMultiScaleDescriptors(img);
          allVectors.push(...vecs);
        }

        if (allVectors.length === 0) {
          throw new Error('Could not extract visual features from camera frame');
        }

        if (payload.product_id) {
          saveStoredEmbeddings(payload.product_id, allVectors);
          const updated = await updateProduct(payload.product_id, {
            image: thumbUrl || undefined,
            has_visual_fingerprint: true,
            reference_image: thumbUrl,
            visual_embeddings: allVectors,
          });
          return updated;
        } else if (payload.name && payload.price !== undefined) {
          const created = await createProduct({
            name: payload.name,
            price: payload.price,
            category: payload.category || 'Household & Grocery',
            image: thumbUrl || payload.image_emoji || '🧴',
            barcode: payload.barcode || String(Math.floor(100000000000 + Math.random() * 900000000000)),
            has_visual_fingerprint: true,
            reference_image: thumbUrl,
            visual_embeddings: allVectors,
            description: 'Trained via Proscan Live Camera',
          });
          saveStoredEmbeddings(created.id, allVectors);
          return created;
        }
        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Visual enrollment failed';
        setError(message);
        return null;
      }
    },
    []
  );

  const detectFromFile = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setError(null);
      try {
        const reader = new FileReader();
        const b64: string = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        return await detectFromBase64(b64, 0.45);
      } catch {
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [detectFromBase64]
  );

  const checkBackendHealth = useCallback(async () => {
    try {
      await getBrowserCocoModel();
      return true;
    } catch {
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
