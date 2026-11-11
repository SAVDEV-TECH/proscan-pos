'use client';

import { useState, useRef, useCallback } from 'react';
import { Product } from '@/lib/products';

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

export function useBackendDetection(backendUrl: string = DEFAULT_BACKEND_URL) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDetection, setLastDetection] = useState<DetectionResponse | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const detectFromBase64 = useCallback(
    async (base64Image: string, confidence: number = 0.38, barcodeHint?: string) => {
      setIsLoading(true);
      setError(null);

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
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
        }
        return null;
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
        const response = await fetch(`${backendUrl}/identify-ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image, confidence: 0.3 }),
        });
        if (!response.ok) {
          throw new Error(`Cloud AI error: ${response.statusText}`);
        }
        const data: DetectionResponse = await response.json();
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
        const response = await fetch(`${backendUrl}/enroll-visual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(`Failed to enroll product visual: ${response.statusText}`);
        }
        return await response.json();
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
    try {
      const response = await fetch(`${backendUrl}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
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
