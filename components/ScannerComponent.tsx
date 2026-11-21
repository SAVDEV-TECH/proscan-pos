'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useBackendDetection, TrackedBox } from '@/lib/useBackendDetection';
import { Product, PRODUCTS, getProductPhoto } from '@/lib/products';
import { fetchProducts } from '@/lib/api';
import { playErrorBuzz } from '@/lib/audio';
import {
  VolumeOnIcon,
  VolumeOffIcon,
  AlertIcon,
  FlashlightIcon,
  RefreshIcon,
  PlayIcon,
  PauseIcon,
  ScanIcon,
  TargetIcon,
  SearchIcon,
  CameraIcon,
  PackageIcon,
  ProductThumbnail,
} from '@/components/Icons';

interface CameraScannerProps {
  onScan: (barcodeOrId: string, productDetails?: Product) => void;
  isScanning: boolean;
}

export function CameraScanner({ onScan, isScanning }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [lastScannedProduct, setLastScannedProduct] = useState<Product | null>(null);
  const [productNotFound, setProductNotFound] = useState(false);
  const [trackedBox, setTrackedBox] = useState<TrackedBox | null>(null);
  const [aiScanning, setAiScanning] = useState(false);

  // Realistic POS Hardware & Cashier Controls
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Live Camera Product Training State
  const [catalogProducts, setCatalogProducts] = useState<Product[]>(PRODUCTS);
  const [showTrainPanel, setShowTrainPanel] = useState(false);
  const [trainMode, setTrainMode] = useState<'new' | 'existing'>('new');
  const [selectedProductId, setSelectedProductId] = useState<string>('prod-001');
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('Household & Cleaning');
  const [isTraining, setIsTraining] = useState(false);
  const [trainFeedback, setTrainFeedback] = useState<string | null>(null);

  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const trackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const trackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrameGrayRef = useRef<Uint8Array | null>(null);
  const trackedBoxRef = useRef<TrackedBox | null>(null);
  const neuralBoxTimestampRef = useRef<number>(0);
  const lastCloudAiCallRef = useRef<number>(0);
  const cooldownRef = useRef(false);
  const lastDetectedIdRef = useRef<string | null>(null);
  const candidateIdRef = useRef<string | null>(null);
  const candidateHitsRef = useRef<number>(0);
  const inFlightRef = useRef(false);
  const nativeBarcodeDetectorRef = useRef<any>(null);

  const {
    detectFromBase64,
    identifyWithCloudAI,
    calibrateBackground,
    enrollVisualProduct,
    checkBackendHealth,
    isLoading: isDetecting,
  } = useBackendDetection();
  const bgCalibratedRef = useRef(false);
  const [bgCalibrated, setBgCalibrated] = useState(false);

  // Initialize native browser BarcodeDetector and Voice POS setting
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedVoice = window.localStorage.getItem('proscan_voice_pos');
      if (savedVoice === null) {
        window.localStorage.setItem('proscan_voice_pos', 'true');
        setVoiceEnabled(true);
      } else {
        setVoiceEnabled(savedVoice === 'true');
      }

      if ('BarcodeDetector' in window) {
        try {
          const BarcodeDetectorClass = (window as any).BarcodeDetector;
          nativeBarcodeDetectorRef.current = new BarcodeDetectorClass({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
          });
        } catch {
          nativeBarcodeDetectorRef.current = null;
        }
      }
    }
  }, []);

  const toggleVoicePos = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('proscan_voice_pos', String(next));
    }
  };

  // Load catalog ONCE on mount (prevents Firestore 429 quota exhaustion!)
  useEffect(() => {
    let mounted = true;
    const initEngineAndCatalog = async () => {
      const [isHealthy, items] = await Promise.all([checkBackendHealth(), fetchProducts()]);
      if (!mounted) return;
      setBackendStatus(isHealthy ? 'connected' : 'disconnected');
      if (items.length > 0) {
        setCatalogProducts(items);
        setSelectedProductId((prev) => prev || items[0].id);
      }
    };
    initEngineAndCatalog();
    return () => {
      mounted = false;
    };
  }, [checkBackendHealth]);

  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraRetryKey, setCameraRetryKey] = useState(0);

  // Initialize camera stream & detect hardware torch support (with safe async cleanup)
  useEffect(() => {
    if (!isScanning) return;
    let cancelled = false;
    let activeStream: MediaStream | null = null;
    const videoEl = videoRef.current;

    const releaseStream = () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
        activeStream = null;
      }
      if (videoEl?.srcObject) {
        (videoEl.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
        videoEl.srcObject = null;
      }
    };

    const startCamera = async () => {
      try {
        releaseStream();
        setTorchOn(false);
        setTorchSupported(false);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: cameraFacing,
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setError(null);
        }

        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as Record<string, unknown>;
          if (caps && 'torch' in caps) {
            setTorchSupported(true);
          }
        }
      } catch (err) {
        if (cancelled) return;
        const rawMsg = err instanceof Error ? err.message : 'Unable to access camera';
        if (rawMsg.toLowerCase().includes('in use') || rawMsg.toLowerCase().includes('notreadable')) {
          setError('Camera is busy in another tab or app (e.g. your other Render/localhost tab). Close that tab and click Retry Camera.');
        } else {
          setError(rawMsg);
        }
      }
    };

    startCamera();
    window.addEventListener('pagehide', releaseStream);
    window.addEventListener('beforeunload', releaseStream);

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', releaseStream);
      window.removeEventListener('beforeunload', releaseStream);
      releaseStream();
    };
  }, [isScanning, cameraFacing, cameraRetryKey]);

  const toggleTorch = async () => {
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()?.[0];
      if (!track) return;
      const next = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // ignore if torch constraint fails on current device
    }
  };

  // Collapse train panel by default on small mobile screens to keep scanner + product in view
  // Helper to capture a clean 480x360 JPEG frame from the video feed
  const captureCleanFrameBase64 = useCallback((): string | null => {
    const vid = videoRef.current;
    const can = canvasRef.current;
    if (!vid || !can || vid.videoWidth === 0 || vid.videoHeight === 0) return null;

    const CAPTURE_W = 480;
    const CAPTURE_H = 360;
    if (can.width !== CAPTURE_W) can.width = CAPTURE_W;
    if (can.height !== CAPTURE_H) can.height = CAPTURE_H;

    const ctx = can.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(vid, 0, 0, CAPTURE_W, CAPTURE_H);
    const dataUrl = can.toDataURL('image/jpeg', 0.85);
    return dataUrl.length > 500 ? dataUrl : null;
  }, []);

  // Capture ONLY the region inside the live Red Tracked Product Box (cropping out the human!)
  const captureTrackedCropBase64 = useCallback((): string | null => {
    const vid = videoRef.current;
    const can = canvasRef.current;
    if (!vid || !can || vid.videoWidth === 0 || vid.videoHeight === 0) return null;

    const box = trackedBoxRef.current;
    if (!box) return captureCleanFrameBase64();

    // Add generous 22% padding around the tracked product box so brand text is never clipped
    const padX = Math.max(8, box.w * 0.22);
    const padY = Math.max(8, box.h * 0.22);
    const xPct = Math.max(0, box.x - padX);
    const yPct = Math.max(0, box.y - padY);
    const wPct = Math.min(100 - xPct, Math.max(38, box.w + padX * 2));
    const hPct = Math.min(100 - yPct, Math.max(38, box.h + padY * 2));

    const sx = Math.round((xPct / 100) * vid.videoWidth);
    const sy = Math.round((yPct / 100) * vid.videoHeight);
    const sw = Math.max(80, Math.round((wPct / 100) * vid.videoWidth));
    const sh = Math.max(80, Math.round((hPct / 100) * vid.videoHeight));

    const OUT_W = 420;
    const OUT_H = Math.max(240, Math.min(420, Math.round((sh / sw) * OUT_W)));
    if (can.width !== OUT_W) can.width = OUT_W;
    if (can.height !== OUT_H) can.height = OUT_H;

    const ctx = can.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);
    const dataUrl = can.toDataURL('image/jpeg', 0.88);
    return dataUrl.length > 500 ? dataUrl : null;
  }, [captureCleanFrameBase64]);

  // Smoothly update the live Red Tracking Pointer position
  const updateTrackedBox = useCallback((nextBox: TrackedBox | null, isNeuralPriority = false) => {
    if (!nextBox) {
      trackedBoxRef.current = null;
      setTrackedBox(null);
      return;
    }
    if (isNeuralPriority) {
      neuralBoxTimestampRef.current = Date.now();
    }
    const prev = trackedBoxRef.current;
    const alpha = isNeuralPriority ? 0.55 : 0.35;
    const smoothed: TrackedBox = prev
      ? {
          x: prev.x + (nextBox.x - prev.x) * alpha,
          y: prev.y + (nextBox.y - prev.y) * alpha,
          w: prev.w + (nextBox.w - prev.w) * alpha,
          h: prev.h + (nextBox.h - prev.h) * alpha,
          label: nextBox.label || prev.label,
        }
      : nextBox;

    trackedBoxRef.current = smoothed;
    setTrackedBox(smoothed);
  }, []);

  // Fast 12-FPS Non-Skin Foreground Product Tracker: follows any moving colorful packaging across the screen!
  useEffect(() => {
    if (!cameraReady || !isCapturing) {
      if (trackIntervalRef.current) {
        clearInterval(trackIntervalRef.current);
        trackIntervalRef.current = null;
      }
      return;
    }

    if (!trackCanvasRef.current && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 48;
      trackCanvasRef.current = c;
    }

    trackIntervalRef.current = setInterval(() => {
      const vid = videoRef.current;
      const tCan = trackCanvasRef.current;
      if (!vid || !tCan || vid.videoWidth === 0 || vid.videoHeight === 0) return;

      // Let fresh neural/Gemini boxes take priority for 700ms
      if (Date.now() - neuralBoxTimestampRef.current < 700) return;

      const ctx = tCan.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const W = 64;
      const H = 48;
      ctx.drawImage(vid, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;
      const currGray = new Uint8Array(W * H);
      const prevGray = prevFrameGrayRef.current;

      let sumX = 0;
      let sumY = 0;
      let totalWeight = 0;
      let minX = W;
      let maxX = 0;
      let minY = H;
      let maxY = 0;
      let vividPixels = 0;

      for (let y = 2; y < H - 2; y++) {
        for (let x = 2; x < W - 2; x++) {
          const i = y * W + x;
          const idx = i * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const gray = (r * 77 + g * 150 + b * 29) >> 8;
          currGray[i] = gray;

          // YCbCr Human Skin-Tone Exclusion so the Red Pointer NEVER tracks faces/hands!
          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
          const isSkinTone = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && r > 60 && r > b;
          if (isSkinTone) continue;

          // Color saturation / vividness of retail packaging (sachets, labels, bottles, logos)
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const sat = maxC > 25 ? (maxC - minC) / maxC : 0;
          const motion = prevGray ? Math.abs(gray - prevGray[i]) : 0;

          // Score pixels that are vivid packaged colors OR actively moving non-skin objects
          let weight = 0;
          if (sat > 0.36 && maxC > 55) weight += sat * 2.4;
          if (motion > 20) weight += Math.min(3.0, motion / 24);

          if (weight >= 1.15) {
            vividPixels++;
            sumX += x * weight;
            sumY += y * weight;
            totalWeight += weight;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      prevFrameGrayRef.current = currGray;

      if (vividPixels >= 28 && totalWeight > 0) {
        const cx = sumX / totalWeight;
        const cy = sumY / totalWeight;
        const spanW = Math.max(18, Math.min(44, (maxX - minX) * 0.85));
        const spanH = Math.max(16, Math.min(36, (maxY - minY) * 0.85));

        const xPct = Math.max(3, Math.min(97 - (spanW / W) * 100, ((cx - spanW / 2) / W) * 100));
        const yPct = Math.max(4, Math.min(96 - (spanH / H) * 100, ((cy - spanH / 2) / H) * 100));
        const wPct = Math.max(24, Math.min(68, (spanW / W) * 100));
        const hPct = Math.max(24, Math.min(72, (spanH / H) * 100));

        updateTrackedBox({
          x: xPct,
          y: yPct,
          w: wPct,
          h: hPct,
          label: 'Product Target',
        });
      }
    }, 85);

    return () => {
      if (trackIntervalRef.current) {
        clearInterval(trackIntervalRef.current);
        trackIntervalRef.current = null;
      }
    };
  }, [cameraReady, isCapturing, updateTrackedBox]);

  // Process a matched product -> add to cart with Supermarket Beep & 2.2s cooldown
  const triggerProductMatch = useCallback(
    (product: Product, _tierLabel?: string) => {
      if (cooldownRef.current) return;

      lastDetectedIdRef.current = product.id;
      cooldownRef.current = true;
      setProductNotFound(false);
      setLastScannedProduct(product);

      onScan(product.id, product);

      setTimeout(() => {
        cooldownRef.current = false;
        setLastScannedProduct(null);
      }, 2200);
    },
    [onScan]
  );

  // Core Continuous POS Scan Loop (Tier 1 Barcode -> Tier 2 Local Visual/Neural -> Tier 3 Auto Gemini Catalog Match)
  const startCapturing = useCallback(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
    }

    setIsCapturing(true);
    setError(null);

    captureIntervalRef.current = setInterval(async () => {
      const vid = videoRef.current;
      if (!vid || vid.videoWidth === 0 || cooldownRef.current || inFlightRef.current) return;

      inFlightRef.current = true;
      try {
        // Tier 1: Browser Native BarcodeDetector
        let detectedBarcode: string | undefined = undefined;
        if (nativeBarcodeDetectorRef.current) {
          try {
            const barcodes = await nativeBarcodeDetectorRef.current.detect(vid);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              detectedBarcode = String(barcodes[0].rawValue).trim();
              const localMatch = catalogProducts.find(
                (p) => p.barcode === detectedBarcode || p.id === detectedBarcode
              );
              if (localMatch) {
                triggerProductMatch(localMatch);
                inFlightRef.current = false;
                return;
              }
            }
          } catch {
            // ignore
          }
        }

        const fullFrame = captureCleanFrameBase64();
        if (!fullFrame) {
          inFlightRef.current = false;
          return;
        }

        const productCrop = captureTrackedCropBase64();

        // Tier 2: Trained Visual Fingerprint (checked on BOTH Red-Tracked Crop & Full Frame) + Neural Box Tracker
        const result = await detectFromBase64(fullFrame, 0.50, detectedBarcode, productCrop);

        if (result?.tracked_box) {
          updateTrackedBox(result.tracked_box, true);
        }

        if (result?.primary_product) {
          const prod = result.primary_product;
          setProductNotFound(false);

          const isInstantMatch =
            result.match_tier?.includes('Barcode') || result.match_tier?.includes('Trained Visual');

          if (isInstantMatch || candidateIdRef.current === prod.id) {
            candidateHitsRef.current += 1;
          } else {
            candidateIdRef.current = prod.id;
            candidateHitsRef.current = 1;
          }

          if (isInstantMatch || candidateHitsRef.current >= 2) {
            candidateHitsRef.current = 0;
            triggerProductMatch(prod);
          }
          inFlightRef.current = false;
          return;
        }

        // Tier 3: Automatic Gemini 2.5 Flash Match across ALL 106+ Mogshops Products!
        // Runs every ~1.8s on the tightly cropped tracked product (cropping out humans!)
        const now = Date.now();
        if (now - lastCloudAiCallRef.current >= 1800) {
          lastCloudAiCallRef.current = now;
          setAiScanning(true);
          try {
            const aiRes = await identifyWithCloudAI(productCrop || fullFrame);
            if (aiRes?.tracked_box && !trackedBoxRef.current) {
              updateTrackedBox(aiRes.tracked_box, true);
            }
            if (aiRes?.primary_product) {
              setProductNotFound(false);
              if (trackedBoxRef.current) {
                updateTrackedBox(
                  { ...trackedBoxRef.current, label: aiRes.primary_product.name },
                  true
                );
              }
              triggerProductMatch(aiRes.primary_product, 'Tier 3: AI Catalog Match');
              setAiScanning(false);
              inFlightRef.current = false;
              return;
            }
          } finally {
            setAiScanning(false);
          }
        }

        candidateIdRef.current = null;
        candidateHitsRef.current = 0;
        setProductNotFound(true);
      } catch (err) {
        console.error('Frame scan error:', err);
      } finally {
        inFlightRef.current = false;
      }
    }, 450);
  }, [
    catalogProducts,
    captureCleanFrameBase64,
    captureTrackedCropBase64,
    detectFromBase64,
    identifyWithCloudAI,
    triggerProductMatch,
    updateTrackedBox,
  ]);

  const stopCapturing = useCallback(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    setIsCapturing(false);
    cooldownRef.current = false;
  }, []);

  // Automatically calibrate negative Background/Face class on startup + start continuous scanning
  useEffect(() => {
    if (cameraReady && backendStatus === 'connected' && !bgCalibratedRef.current) {
      bgCalibratedRef.current = true;
      (async () => {
        await new Promise((r) => setTimeout(r, 400));
        const f1 = captureCleanFrameBase64();
        if (f1) await calibrateBackground(f1);
        await new Promise((r) => setTimeout(r, 300));
        const f2 = captureCleanFrameBase64();
        if (f2) await calibrateBackground(f2);
        setBgCalibrated(true);
      })();
    }
    if (cameraReady && backendStatus === 'connected' && !isCapturing) {
      startCapturing();
    }
    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, [cameraReady, backendStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRecalibrateBg = async () => {
    const f = captureCleanFrameBase64();
    if (f) {
      await calibrateBackground(f);
      setBgCalibrated(true);
    }
  };

  // 3-Frame Burst Capture & Visual Training -> Captures ONLY the Red-Tracked Product (excluding humans)
  const handleQuickTrain = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const frame1 = captureTrackedCropBase64();
    if (!frame1) {
      setTrainFeedback('Camera feed not ready yet.');
      return;
    }

    if (trainMode === 'new' && (!newProdName.trim() || !newProdPrice.trim())) {
      setTrainFeedback('Please enter Product Name and Price first.');
      return;
    }

    setIsTraining(true);
    setTrainFeedback('Capturing product...');

    // Capture 2 additional rapid burst frames (both tight product crop and full frame for multi-distance matching)
    const extraFrames: string[] = [];
    const fullSnap = captureCleanFrameBase64();
    if (fullSnap) extraFrames.push(fullSnap);
    for (let i = 0; i < 2; i++) {
      await new Promise((r) => setTimeout(r, 120));
      const f = captureTrackedCropBase64();
      if (f) extraFrames.push(f);
    }

    let trained: Product | null = null;
    if (trainMode === 'existing') {
      trained = await enrollVisualProduct({
        product_id: selectedProductId,
        frame_base64: frame1,
        extra_frames: extraFrames,
      });
    } else {
      trained = await enrollVisualProduct({
        name: newProdName.trim(),
        price: parseFloat(newProdPrice),
        category: newProdCategory.trim() || 'Household & Cleaning',
        frame_base64: frame1,
        extra_frames: extraFrames,
      });
    }

    setIsTraining(false);

    if (trained) {
      const updatedList = await fetchProducts();
      setCatalogProducts(updatedList);
      setTrainFeedback(
        `Saved "${trained.name}" ($${trained.price.toFixed(2)})`
      );
      setNewProdName('');
      setNewProdPrice('');
      triggerProductMatch(trained, 'Trained & Added to Backend');
    } else {
      setTrainFeedback('Could not capture product. Hold steady and try again.');
    }
  };

  const simulateBarcodeScan = () => {
    const pool = catalogProducts.length > 0 ? catalogProducts : PRODUCTS;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    triggerProductMatch(picked, 'Tier 1: Simulated Barcode POS');
  };

  const handleManualLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const query = manualQuery.trim().toLowerCase();
    if (!query) return;

    const pool = catalogProducts.length > 0 ? catalogProducts : PRODUCTS;
    const match = pool.find(
      (p) =>
        p.barcode.toLowerCase() === query ||
        p.id.toLowerCase() === query ||
        p.name.toLowerCase().includes(query)
    );

    if (match) {
      setManualError(null);
      setManualQuery('');
      triggerProductMatch(match, 'Manual PLU / Barcode Entry');
    } else {
      playErrorBuzz();
      setManualError(`No SKU found for "${manualQuery.trim()}"`);
      setTimeout(() => setManualError(null), 3000);
    }
  };

  return (
    <div className="space-y-3">
      {/* Compact Status Bar + Voice Toggle */}
      <div
        className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-colors ${
          backendStatus === 'connected'
            ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
            : backendStatus === 'checking'
            ? 'bg-amber-50 text-amber-900 border border-amber-200'
            : 'bg-slate-100 text-slate-700 border border-slate-200'
        }`}
      >
        <div className="flex items-center space-x-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              backendStatus === 'connected'
                ? 'bg-emerald-500'
                : backendStatus === 'checking'
                ? 'bg-amber-500 animate-pulse'
                : 'bg-slate-400'
            }`}
          />
          <span className="truncate">
            {backendStatus === 'connected'
              ? 'Online'
              : backendStatus === 'checking'
              ? 'Connecting...'
              : 'Local Mode'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isDetecting && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          )}
          <button
            type="button"
            onClick={handleRecalibrateBg}
            title="Teach camera what empty counter / your face looks like so it never false-triggers"
            className="px-2 py-1 rounded-full text-[11px] font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
          >
            {bgCalibrated ? 'BG Locked' : 'Set BG'}
          </button>
          <button
            type="button"
            onClick={toggleVoicePos}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all flex items-center space-x-1 ${
              voiceEnabled
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-300'
            }`}
          >
            {voiceEnabled ? (
              <VolumeOnIcon className="w-3.5 h-3.5" />
            ) : (
              <VolumeOffIcon className="w-3.5 h-3.5" />
            )}
            <span>{voiceEnabled ? 'Voice' : 'Muted'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2.5 rounded-xl text-xs flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <AlertIcon className="w-4 h-4 shrink-0 text-red-600" />
            <span className="break-words font-medium">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setCameraRetryKey((k) => k + 1);
            }}
            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shrink-0"
          >
            Retry Camera
          </button>
        </div>
      )}

      {/* Compact Downsized POS Camera Viewport */}
      <div className="relative mx-auto w-full max-w-[360px] h-[215px] sm:h-[235px] bg-zinc-950 rounded-2xl overflow-hidden border-2 border-zinc-800 shadow-inner">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setCameraReady(true)}
          className="w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Green Laser Shutter Flash on Product Lock */}
        {lastScannedProduct && (
          <div className="absolute inset-0 bg-emerald-400/20 pointer-events-none transition-opacity duration-200" />
        )}

        {/* Dynamic Moving Red Product Pointer & Tracking Box (Follows Product, Ignores Humans) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {trackedBox ? (
            <div
              style={{
                left: `${trackedBox.x}%`,
                top: `${trackedBox.y}%`,
                width: `${trackedBox.w}%`,
                height: `${trackedBox.h}%`,
              }}
              className={`absolute rounded-xl border-2 transition-all duration-150 ease-out flex items-center justify-center ${
                lastScannedProduct
                  ? 'border-emerald-400 bg-emerald-500/15 shadow-[0_0_28px_rgba(16,185,129,0.75)]'
                  : 'border-red-500/90 bg-red-500/5 shadow-[0_0_22px_rgba(239,68,68,0.55)]'
              }`}
            >
              {/* Pointed Red Arrow Pointer hovering over the moving product */}
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider text-white whitespace-nowrap shadow-lg ${
                    lastScannedProduct
                      ? 'bg-emerald-600'
                      : aiScanning
                      ? 'bg-red-600 animate-pulse'
                      : 'bg-red-600/95'
                  }`}
                >
                  {lastScannedProduct
                    ? lastScannedProduct.name
                    : aiScanning
                    ? 'Matching...'
                    : 'Product Locked'}
                </span>
                <svg
                  viewBox="0 0 20 12"
                  className={`w-4 h-3 -mt-0.5 drop-shadow-[0_2px_4px_rgba(239,68,68,0.85)] ${
                    lastScannedProduct ? 'text-emerald-400' : 'text-red-500'
                  }`}
                  fill="currentColor"
                >
                  <polygon points="10,12 0,0 20,0" />
                </svg>
              </div>

              {/* Crisp Red Corner L-Brackets */}
              <span
                className={`absolute -top-0.5 -left-0.5 w-4 h-4 border-t-[3px] border-l-[3px] rounded-tl-md ${
                  lastScannedProduct ? 'border-emerald-400' : 'border-red-500'
                }`}
              />
              <span
                className={`absolute -top-0.5 -right-0.5 w-4 h-4 border-t-[3px] border-r-[3px] rounded-tr-md ${
                  lastScannedProduct ? 'border-emerald-400' : 'border-red-500'
                }`}
              />
              <span
                className={`absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-[3px] border-l-[3px] rounded-bl-md ${
                  lastScannedProduct ? 'border-emerald-400' : 'border-red-500'
                }`}
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-[3px] border-r-[3px] rounded-br-md ${
                  lastScannedProduct ? 'border-emerald-400' : 'border-red-500'
                }`}
              />

              {/* Red Laser Crosshair Dot right on the Product */}
              <div className="relative flex items-center justify-center">
                <span
                  className={`w-3.5 h-3.5 rounded-full border-2 ${
                    lastScannedProduct
                      ? 'border-emerald-400 bg-emerald-400/30'
                      : 'border-red-500 bg-red-500/30 animate-ping'
                  }`}
                />
                <span
                  className={`absolute w-1.5 h-1.5 rounded-full ${
                    lastScannedProduct ? 'bg-emerald-300' : 'bg-red-500 shadow-[0_0_10px_#ef4444]'
                  }`}
                />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="w-48 h-36 border border-dashed border-red-400/50 rounded-2xl flex items-center justify-center relative">
                <span className="w-2 h-2 rounded-full bg-red-500/80 animate-pulse" />
                <span className="absolute bottom-2 text-[10px] font-bold uppercase tracking-wider text-white bg-black/70 px-2.5 py-0.5 rounded-full">
                  {productNotFound ? 'Product Not Found' : 'Show Product'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Instant Detection Flash Banner */}
        {lastScannedProduct && (
          <div className="absolute top-2.5 left-2.5 right-2.5 bg-emerald-600/95 backdrop-blur-md text-white px-3 py-2 rounded-xl shadow-xl flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 font-bold text-xs sm:text-sm min-w-0">
              <ProductThumbnail
                src={getProductPhoto(lastScannedProduct)}
                name={lastScannedProduct.name}
                category={lastScannedProduct.category}
                className="w-8 h-8 rounded-lg"
              />
              <span className="truncate">
                {lastScannedProduct.name} • ${lastScannedProduct.price.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Bottom Overlay Bar */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none">
          <div>
            {isCapturing ? (
              <div className="flex items-center space-x-1.5 bg-black/75 backdrop-blur-sm px-2.5 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                <span className="text-white text-[11px] font-semibold">Auto-Scan</span>
              </div>
            ) : (
              <div className="bg-black/60 px-2.5 py-1 rounded-full text-white/70 text-[11px]">
                Paused
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto">
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`active:scale-95 text-[11px] font-semibold px-2.5 py-1 rounded-full border backdrop-blur-sm transition-all flex items-center space-x-1 ${
                  torchOn
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-black/75 text-white border-white/20'
                }`}
              >
                <FlashlightIcon className="w-3.5 h-3.5" />
                <span>Light</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))}
              className="bg-black/75 hover:bg-black/90 active:scale-95 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full border border-white/20 backdrop-blur-sm transition-all flex items-center space-x-1"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
              <span>Flip</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary POS Controls (1-2 word labels) */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={isCapturing ? stopCapturing : startCapturing}
          disabled={backendStatus !== 'connected'}
          className={`min-h-[42px] py-2 px-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all active:scale-[0.98] flex items-center justify-center space-x-1.5 ${
            backendStatus !== 'connected'
              ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
              : isCapturing
              ? 'bg-rose-600 hover:bg-rose-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          {isCapturing ? (
            <PauseIcon className="w-4 h-4" />
          ) : (
            <PlayIcon className="w-4 h-4" />
          )}
          <span>{isCapturing ? 'Pause' : 'Resume'}</span>
        </button>

        <button
          type="button"
          onClick={simulateBarcodeScan}
          className="min-h-[42px] bg-zinc-800 hover:bg-zinc-900 text-white py-2 px-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all active:scale-[0.98] flex items-center justify-center space-x-1.5"
        >
          <ScanIcon className="w-4 h-4" />
          <span>Simulate</span>
        </button>

        <button
          type="button"
          onClick={() => setShowTrainPanel((prev) => !prev)}
          className={`min-h-[42px] py-2 px-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all active:scale-[0.98] flex items-center justify-center space-x-1.5 ${
            showTrainPanel
              ? 'bg-indigo-700 text-white'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
        >
          <TargetIcon className="w-4 h-4" />
          <span>Train</span>
        </button>
      </div>

      {/* Compact Manual Lookup + Quick-Tap POS Keys */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2">
        <form onSubmit={handleManualLookup} className="flex gap-1.5">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="Barcode or item name..."
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 text-base sm:text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="absolute left-2.5 top-2.5 sm:top-2 text-slate-400">
              <SearchIcon className="w-3.5 h-3.5" />
            </span>
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold text-xs rounded-lg shrink-0"
          >
            Add
          </button>
        </form>

        {manualError && (
          <p className="text-xs font-semibold text-rose-600 px-1">{manualError}</p>
        )}

        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {(catalogProducts.length > 0 ? catalogProducts : PRODUCTS).slice(0, 8).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => triggerProductMatch(item, 'Quick-Key')}
              className="flex items-center space-x-1.5 bg-white hover:bg-indigo-50 active:scale-95 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 shrink-0"
            >
              <PackageIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="max-w-[85px] truncate">{item.name}</span>
              <span className="text-emerald-700 font-bold">${item.price.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Collapsible Product Trainer Panel */}
      {showTrainPanel && (
        <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-indigo-950 text-xs sm:text-sm flex items-center space-x-1.5">
              <CameraIcon className="w-4 h-4 text-indigo-600" />
              <span>Train Product</span>
            </h4>

            <div className="flex gap-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setTrainMode('new')}
                className={`px-2.5 py-1 rounded-lg ${
                  trainMode === 'new'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-indigo-700 border border-indigo-200'
                }`}
              >
                + New
              </button>
              <button
                type="button"
                onClick={() => setTrainMode('existing')}
                className={`px-2.5 py-1 rounded-lg ${
                  trainMode === 'existing'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-indigo-700 border border-indigo-200'
                }`}
              >
                Existing
              </button>
            </div>
          </div>

          {trainMode === 'new' ? (
            <form onSubmit={handleQuickTrain} className="space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
                <div className="col-span-2 sm:col-span-5">
                  <input
                    type="text"
                    required
                    placeholder="Product Name *"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-indigo-300 text-base sm:text-xs bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="col-span-1 sm:col-span-3">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="Price ($) *"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-indigo-300 text-base sm:text-xs bg-white text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="col-span-1 sm:col-span-4">
                  <input
                    type="text"
                    placeholder="Category"
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-indigo-300 text-base sm:text-xs bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isTraining}
                className="w-full min-h-[40px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-xs shadow-sm active:scale-[0.98] flex items-center justify-center space-x-1.5"
              >
                <CameraIcon className="w-4 h-4" />
                <span>{isTraining ? 'Saving...' : 'Capture & Save'}</span>
              </button>
            </form>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-indigo-300 text-base sm:text-xs bg-white font-medium text-slate-900"
              >
                {catalogProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (${p.price.toFixed(2)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isTraining}
                onClick={() => handleQuickTrain()}
                className="w-full sm:w-auto min-h-[40px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center justify-center space-x-1.5"
              >
                <CameraIcon className="w-4 h-4" />
                <span>{isTraining ? 'Saving...' : 'Update'}</span>
              </button>
            </div>
          )}

          {trainFeedback && (
            <div className="text-xs font-semibold text-indigo-950 bg-white px-3 py-2 rounded-lg border border-indigo-200 break-words">
              {trainFeedback}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
