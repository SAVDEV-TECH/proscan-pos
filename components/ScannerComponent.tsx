'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useBackendDetection } from '@/lib/useBackendDetection';
import { Product } from '@/lib/products';
import { fetchProducts } from '@/lib/api';

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
  const [lastScannedName, setLastScannedName] = useState<string | null>(null);
  const [humanWarning, setHumanWarning] = useState(false);
  const [activeTier, setActiveTier] = useState<string>('3-Tier Auto-POS Ready');

  // Quick-Train Visual Fingerprint Modal State
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [showTrainPanel, setShowTrainPanel] = useState(false);
  const [trainMode, setTrainMode] = useState<'existing' | 'new'>('existing');
  const [selectedProductId, setSelectedProductId] = useState<string>('prod-001');
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdEmoji] = useState('📦');
  const [trainFeedback, setTrainFeedback] = useState<string | null>(null);

  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownRef = useRef(false);
  const lastDetectedIdRef = useRef<string | null>(null);
  const candidateIdRef = useRef<string | null>(null);
  const candidateHitsRef = useRef<number>(0);
  const inFlightRef = useRef(false);
  const nativeBarcodeDetectorRef = useRef<any>(null);

  const {
    detectFromBase64,
    identifyWithCloudAI,
    enrollVisualProduct,
    checkBackendHealth,
    isLoading: isDetecting,
    lastDetection,
  } = useBackendDetection();

  // Initialize native browser BarcodeDetector if available (Chrome / Edge / Android)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const BarcodeDetectorClass = (window as any).BarcodeDetector;
        nativeBarcodeDetectorRef.current = new BarcodeDetectorClass({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });
      } catch {
        nativeBarcodeDetectorRef.current = null;
      }
    }
  }, []);

  // Poll backend health every 4 seconds so it auto-connects when backend starts
  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      const isHealthy = await checkBackendHealth();
      if (!mounted) return;
      setBackendStatus(isHealthy ? 'connected' : 'disconnected');
      if (isHealthy) {
        const items = await fetchProducts();
        if (mounted) {
          setCatalogProducts(items);
          if (items.length > 0 && !selectedProductId) {
            setSelectedProductId(items[0].id);
          }
        }
      }
    };
    checkHealth();
    const healthTimer = setInterval(checkHealth, 4000);
    return () => {
      mounted = false;
      clearInterval(healthTimer);
    };
  }, [checkBackendHealth, selectedProductId]);

  // Initialize camera stream
  useEffect(() => {
    if (!isScanning) return;
    const videoEl = videoRef.current;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setError(null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to access camera';
        setError(message);
      }
    };

    startCamera();

    return () => {
      if (videoEl?.srcObject) {
        const tracks = (videoEl.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, [isScanning]);

  // Helper to capture a clean, properly sized frame from the video feed
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
    const dataUrl = can.toDataURL('image/jpeg', 0.82);
    return dataUrl.length > 500 ? dataUrl : null;
  }, []);

  // Process a matched product -> add to cart with Supermarket Beep & 2.2s same-item cooldown
  const triggerProductMatch = useCallback(
    (product: Product, tierLabel?: string) => {
      if (cooldownRef.current) return;

      lastDetectedIdRef.current = product.id;
      cooldownRef.current = true;
      setHumanWarning(false);
      if (tierLabel) setActiveTier(tierLabel);
      setLastScannedName(`${product.image} ${product.name} — $${product.price.toFixed(2)}`);

      onScan(product.id, product);

      setTimeout(() => {
        cooldownRef.current = false;
        setLastScannedName(null);
      }, 2200);
    },
    [onScan]
  );

  // Core Continuous POS Scan Loop (runs automatically once camera & backend are ready)
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
        // Tier 1 (Browser Native BarcodeDetector): Check for 1D/2D barcode in <15ms
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
                triggerProductMatch(localMatch, 'Tier 1: Instant Barcode POS');
                inFlightRef.current = false;
                return;
              }
            }
          } catch {
            // Ignore native detector errors on unsupported frames
          }
        }

        // Capture full-frame 480x360 JPEG without canvas cropping bugs
        const base64Image = captureCleanFrameBase64();
        if (!base64Image) {
          inFlightRef.current = false;
          return;
        }

        // Tier 2: Send to Hybrid YOLOv8 + Visual Fingerprint + Human Filter Backend
        const result = await detectFromBase64(base64Image, 0.58, detectedBarcode);

        if (result?.human_detected) {
          candidateIdRef.current = null;
          candidateHitsRef.current = 0;
          setLastScannedName(null);
          setHumanWarning(true);
          setActiveTier('Safety Filter: Human Not Valid');
          inFlightRef.current = false;
          return;
        } else {
          setHumanWarning(false);
        }

        if (result?.primary_product) {
          const prod = result.primary_product;
          if (result.match_tier?.includes('Barcode') || candidateIdRef.current === prod.id) {
            candidateHitsRef.current += 1;
          } else {
            candidateIdRef.current = prod.id;
            candidateHitsRef.current = 1;
          }

          if (candidateHitsRef.current >= 2 || result.match_tier?.includes('Barcode')) {
            candidateHitsRef.current = 0;
            triggerProductMatch(prod, result.match_tier || 'Tier 2: Hybrid AI POS');
          }
        } else {
          candidateIdRef.current = null;
          candidateHitsRef.current = 0;
        }
      } catch (err) {
        console.error('Frame scan error:', err);
      } finally {
        inFlightRef.current = false;
      }
    }, 450); // Fast 450ms POS polling cycle
  }, [catalogProducts, captureCleanFrameBase64, detectFromBase64, triggerProductMatch]);

  const stopCapturing = useCallback(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    setIsCapturing(false);
    cooldownRef.current = false;
  }, []);

  // Automatically start continuous scanning as soon as camera + backend are ready!
  useEffect(() => {
    if (cameraReady && backendStatus === 'connected' && !isCapturing) {
      startCapturing();
    }
    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, [cameraReady, backendStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle 1-Click Visual Fingerprint Training
  const handleQuickTrain = async () => {
    const frame = captureCleanFrameBase64();
    if (!frame) {
      setTrainFeedback('⚠️ Camera not ready — hold product in view and try again.');
      return;
    }

    setTrainFeedback('⏳ Capturing visual fingerprint...');
    let trained: Product | null = null;

    if (trainMode === 'existing') {
      trained = await enrollVisualProduct({
        product_id: selectedProductId,
        frame_base64: frame,
      });
    } else {
      if (!newProdName.trim() || !newProdPrice.trim()) {
        setTrainFeedback('⚠️ Enter product name and price first.');
        return;
      }
      trained = await enrollVisualProduct({
        name: newProdName.trim(),
        price: parseFloat(newProdPrice),
        image_emoji: newProdEmoji || '📦',
        category: 'Store Custom',
        frame_base64: frame,
      });
    }

    if (trained) {
      const updatedList = await fetchProducts();
      setCatalogProducts(updatedList);
      setTrainFeedback(`✅ Trained "${trained.name}" ($${trained.price.toFixed(2)})! Show it to the camera anytime for instant recognition.`);
      setNewProdName('');
      setNewProdPrice('');
      triggerProductMatch(trained, 'Visual Fingerprint Enrolled');
    } else {
      setTrainFeedback('❌ Could not enroll visual fingerprint. Check backend connection.');
    }
  };

  // Tier 3 Deep Cloud AI Scan on demand
  const handleDeepCloudScan = async () => {
    const frame = captureCleanFrameBase64();
    if (!frame) return;
    const res = await identifyWithCloudAI(frame);
    if (res?.human_detected) {
      setHumanWarning(true);
      return;
    }
    if (res?.primary_product) {
      triggerProductMatch(res.primary_product, res.match_tier || 'Tier 3: Cloud AI Match');
    }
  };

  const simulateBarcodeScan = () => {
    const pool = catalogProducts.length > 0 ? catalogProducts : [
      { id: 'prod-001', name: 'Spring Water Bottle', price: 1.50, image: '💧', barcode: '123456789012', category: 'Beverages' },
      { id: 'prod-002', name: 'Fresh Red Apple', price: 0.85, image: '🍎', barcode: '234567890123', category: 'Produce' },
      { id: 'prod-003', name: 'Organic Banana', price: 0.65, image: '🍌', barcode: '345678901234', category: 'Produce' },
      { id: 'prod-004', name: 'Ceramic Coffee Mug', price: 4.99, image: '☕', barcode: '456789012345', category: 'Kitchenware' },
      { id: 'prod-009', name: 'Hungryman Instant Noodles', price: 1.20, image: '🍜', barcode: '901234567890', category: 'Food & Grocery' },
    ];
    const picked = pool[Math.floor(Math.random() * pool.length)];
    triggerProductMatch(picked, 'Tier 1: Simulated Barcode POS');
  };

  return (
    <div className="space-y-4">
      {/* Backend Status Bar */}
      <div
        className={`px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-between shadow-sm transition-colors ${
          backendStatus === 'connected'
            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
            : backendStatus === 'checking'
            ? 'bg-amber-100 text-amber-900 border border-amber-300'
            : 'bg-rose-100 text-rose-900 border border-rose-300'
        }`}
      >
        <div className="flex items-center space-x-2">
          <span className="text-lg">
            {backendStatus === 'connected' ? '🟢' : backendStatus === 'checking' ? '🟡' : '🔴'}
          </span>
          <span>
            {backendStatus === 'connected'
              ? `POS Engine Online • ${activeTier}`
              : backendStatus === 'checking'
              ? 'Connecting to POS Engine...'
              : 'POS Engine Offline (Port 8000)'}
          </span>
        </div>
        {isDetecting && (
          <span className="text-xs bg-emerald-200 text-emerald-800 px-2.5 py-0.5 rounded-full font-mono animate-pulse">
            ⚡ Scanning...
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded-lg text-sm flex items-center space-x-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Video Viewport */}
      <div className="relative bg-zinc-950 rounded-xl overflow-hidden aspect-video border-2 border-zinc-800 shadow-inner">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setCameraReady(true)}
          className="w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Supermarket POS Laser & Reticle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`w-72 h-52 border-2 rounded-2xl transition-all duration-200 relative flex items-center justify-center ${
              humanWarning
                ? 'border-rose-500 bg-rose-500/15 scale-95'
                : lastScannedName
                ? 'border-emerald-400 bg-emerald-500/15 scale-105 shadow-[0_0_30px_rgba(16,185,129,0.5)]'
                : isCapturing
                ? 'border-indigo-400/90 border-dashed'
                : 'border-white/30'
            }`}
          >
            {isCapturing && !lastScannedName && !humanWarning && (
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-80 animate-pulse" />
            )}
            <span className="absolute -bottom-6 text-[11px] font-bold uppercase tracking-wider text-white/80 bg-black/60 px-2.5 py-0.5 rounded-full">
              {humanWarning ? '🚫 Human Not Valid' : 'Hold Product or Barcode Here'}
            </span>
          </div>
        </div>

        {/* Human Face / Person Rejection Alert */}
        {humanWarning && !lastScannedName && (
          <div className="absolute top-4 left-4 right-4 bg-rose-600/95 backdrop-blur-md text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center justify-between">
            <div className="flex items-center space-x-2 font-bold text-sm sm:text-base">
              <span>🚫 HUMAN NOT VALID</span>
              <span className="text-xs sm:text-sm font-normal text-rose-100">
                — Show a store product in front of the scanner
              </span>
            </div>
            <span className="text-xs bg-rose-800 px-2 py-1 rounded font-semibold uppercase">
              Blocked
            </span>
          </div>
        )}

        {/* Instant Detection Flash Banner */}
        {lastScannedName && (
          <div className="absolute top-4 left-4 right-4 bg-emerald-600/95 backdrop-blur-md text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center justify-between animate-bounce">
            <div className="flex items-center space-x-2 font-bold text-sm sm:text-base">
              <span>✅ BEEP! ADDED:</span>
              <span>{lastScannedName}</span>
            </div>
            <span className="text-xs bg-emerald-800 px-2 py-1 rounded font-semibold uppercase tracking-wider">
              Auto-Cart
            </span>
          </div>
        )}

        {/* Live Scanner Indicator */}
        <div className="absolute bottom-3 left-3">
          {isCapturing ? (
            <div className="flex items-center space-x-2 bg-black/75 backdrop-blur-sm px-3 py-1.5 rounded-full">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-white text-xs font-semibold">Hands-Free Auto-Scan ON</span>
            </div>
          ) : (
            <div className="bg-black/60 px-3 py-1.5 rounded-full text-white/70 text-xs">
              Scanner Paused
            </div>
          )}
        </div>
      </div>

      {/* Live Frame Telemetry */}
      {lastDetection && lastDetection.detections.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Live Optical Telemetry:
          </p>
          <div className="flex flex-wrap gap-2">
            {lastDetection.detections.map((det, i) => (
              <span
                key={i}
                className={`text-xs px-2.5 py-1 rounded-md font-medium flex items-center space-x-1.5 ${
                  det.class_name === 'person'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : det.product_id
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-semibold'
                    : 'bg-zinc-100 text-zinc-700'
                }`}
              >
                <span>
                  {det.class_name === 'person'
                    ? '🚫 Human (Ignored)'
                    : det.product_name ?? det.class_name}
                </span>
                <span className="opacity-60 text-[10px]">
                  ({(det.confidence * 100).toFixed(0)}%)
                </span>
                {det.product_price && (
                  <span className="text-emerald-700 font-bold">
                    ${det.product_price.toFixed(2)}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Primary POS Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={isCapturing ? stopCapturing : startCapturing}
          disabled={backendStatus !== 'connected'}
          className={`py-3 px-4 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2 ${
            backendStatus !== 'connected'
              ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed shadow-none'
              : isCapturing
              ? 'bg-rose-600 hover:bg-rose-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          <span>{isCapturing ? '⏹️ Pause Auto-Scan' : '▶️ Resume Auto-Scan'}</span>
        </button>

        <button
          onClick={() => setShowTrainPanel((prev) => !prev)}
          disabled={backendStatus !== 'connected'}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-200 disabled:text-zinc-400 text-white py-3 px-4 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2"
        >
          <span>🎯 Quick-Train Any Product</span>
        </button>

        <button
          onClick={simulateBarcodeScan}
          className="bg-zinc-800 hover:bg-zinc-900 text-white py-3 px-4 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2"
        >
          <span>📋 Simulate POS Scan</span>
        </button>
      </div>

      {/* 1-Click Visual Product Trainer Panel */}
      {showTrainPanel && (
        <div className="bg-indigo-50/90 border-2 border-indigo-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-indigo-950 text-sm">
                🎯 1-Click Visual Fingerprint Trainer (99.9% Local Match)
              </h4>
              <p className="text-xs text-indigo-800">
                Hold ANY physical item from your shop inside the camera box above and click{' '}
                <strong>Capture &amp; Bind</strong>. The scanner will memorize its exact package colors &amp; shape and recognize it in &lt;50ms!
              </p>
            </div>
            <button
              onClick={handleDeepCloudScan}
              className="text-xs bg-white border border-indigo-300 text-indigo-700 px-2.5 py-1.5 rounded-lg font-semibold hover:bg-indigo-100 shrink-0"
            >
              ✨ Cloud AI Identify
            </button>
          </div>

          <div className="flex space-x-2 text-xs font-bold">
            <button
              type="button"
              onClick={() => setTrainMode('existing')}
              className={`px-3 py-1.5 rounded-lg ${
                trainMode === 'existing'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-indigo-700 border border-indigo-200'
              }`}
            >
              Bind to Existing Database Item
            </button>
            <button
              type="button"
              onClick={() => setTrainMode('new')}
              className={`px-3 py-1.5 rounded-lg ${
                trainMode === 'new'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-indigo-700 border border-indigo-200'
              }`}
            >
              ➕ Create &amp; Train New Store Item
            </button>
          </div>

          {trainMode === 'existing' ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-indigo-300 text-sm bg-white font-medium text-slate-900"
              >
                {catalogProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.image} {p.name} — ${p.price.toFixed(2)}{' '}
                    {p.has_visual_fingerprint ? ' (✅ Trained)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleQuickTrain}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-lg text-sm shadow"
              >
                📸 Capture &amp; Bind Item Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                placeholder="Product Name (e.g. Peak Milk)"
                value={newProdName}
                onChange={(e) => setNewProdName(e.target.value)}
                className="sm:col-span-2 px-3 py-2 rounded-lg border border-indigo-300 text-sm bg-white text-slate-900"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Price ($)"
                value={newProdPrice}
                onChange={(e) => setNewProdPrice(e.target.value)}
                className="px-3 py-2 rounded-lg border border-indigo-300 text-sm bg-white text-slate-900"
              />
              <button
                type="button"
                onClick={handleQuickTrain}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-sm shadow"
              >
                📸 Save &amp; Train
              </button>
            </div>
          )}

          {trainFeedback && (
            <p className="text-xs font-semibold text-indigo-950 bg-white/80 px-3 py-2 rounded-lg border border-indigo-200">
              {trainFeedback}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
