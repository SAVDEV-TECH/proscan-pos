'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useBackendDetection } from '@/lib/useBackendDetection';
import { Product, getProductPhoto, isRealImage } from '@/lib/products';
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
  const [lastScannedProduct, setLastScannedProduct] = useState<Product | null>(null);
  const [productNotFound, setProductNotFound] = useState(false);
  const [activeTier, setActiveTier] = useState<string>('3-Tier Auto-POS Ready');

  // Live Camera Product Training State (Open by default so new items like VIVE Detergent can be trained immediately)
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [showTrainPanel, setShowTrainPanel] = useState(true);
  const [trainMode, setTrainMode] = useState<'new' | 'existing'>('new');
  const [selectedProductId, setSelectedProductId] = useState<string>('prod-001');
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('Household & Cleaning');
  const [isTraining, setIsTraining] = useState(false);
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
    enrollVisualProduct,
    checkBackendHealth,
    isLoading: isDetecting,
    lastDetection,
  } = useBackendDetection();

  // Initialize native browser BarcodeDetector if available
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

  // Poll health & sync catalog
  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      const isHealthy = await checkBackendHealth();
      if (!mounted) return;
      setBackendStatus(isHealthy ? 'connected' : 'disconnected');
      const items = await fetchProducts();
      if (mounted) {
        setCatalogProducts(items);
        if (items.length > 0 && !selectedProductId) {
          setSelectedProductId(items[0].id);
        }
      }
    };
    checkHealth();
    const healthTimer = setInterval(checkHealth, 5000);
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

  // Process a matched product -> add to cart with Supermarket Beep & 2.2s cooldown
  const triggerProductMatch = useCallback(
    (product: Product, tierLabel?: string) => {
      if (cooldownRef.current) return;

      lastDetectedIdRef.current = product.id;
      cooldownRef.current = true;
      setProductNotFound(false);
      if (tierLabel) setActiveTier(tierLabel);
      setLastScannedProduct(product);

      onScan(product.id, product);

      setTimeout(() => {
        cooldownRef.current = false;
        setLastScannedProduct(null);
      }, 2200);
    },
    [onScan]
  );

  // Core Continuous POS Scan Loop (ignores humans completely, focuses only on products)
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
                triggerProductMatch(localMatch, 'Tier 1: Instant Barcode POS');
                inFlightRef.current = false;
                return;
              }
            }
          } catch {
            // ignore
          }
        }

        const base64Image = captureCleanFrameBase64();
        if (!base64Image) {
          inFlightRef.current = false;
          return;
        }

        // Tier 2: Trained Visual Fingerprint + Neural Object Match (humans ignored)
        const result = await detectFromBase64(base64Image, 0.50, detectedBarcode);

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
            triggerProductMatch(prod, result.match_tier || 'Tier 2: Hybrid AI POS');
          }
        } else {
          candidateIdRef.current = null;
          candidateHitsRef.current = 0;
          setProductNotFound(true);
          setActiveTier('Product Not Found');
        }
      } catch (err) {
        console.error('Frame scan error:', err);
      } finally {
        inFlightRef.current = false;
      }
    }, 420);
  }, [catalogProducts, captureCleanFrameBase64, detectFromBase64, triggerProductMatch]);

  const stopCapturing = useCallback(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    setIsCapturing(false);
    cooldownRef.current = false;
  }, []);

  // Automatically start continuous scanning as soon as camera + engine are ready
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

  // 3-Frame Burst Capture & Visual Training -> Saves to Backend Catalog
  const handleQuickTrain = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const frame1 = captureCleanFrameBase64();
    if (!frame1) {
      setTrainFeedback('⚠️ Camera feed not ready yet — allow camera access and try again.');
      return;
    }

    if (trainMode === 'new' && (!newProdName.trim() || !newProdPrice.trim())) {
      setTrainFeedback('⚠️ Please enter the Product Name (e.g. VIVE Detergent) and Price first.');
      return;
    }

    setIsTraining(true);
    setTrainFeedback('📸 Capturing 3-angle visual burst of product in box...');

    // Capture 2 additional rapid burst frames 120ms apart for rock-solid recognition
    const extraFrames: string[] = [];
    for (let i = 0; i < 2; i++) {
      await new Promise((r) => setTimeout(r, 120));
      const f = captureCleanFrameBase64();
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
        `✅ Trained & Saved "${trained.name}" ($${trained.price.toFixed(2)}) to backend catalog! Hold it in the camera box anytime to auto-add to cart.`
      );
      setNewProdName('');
      setNewProdPrice('');
      triggerProductMatch(trained, 'Trained & Added to Backend');
    } else {
      setTrainFeedback('❌ Could not capture product features. Hold the product steady inside the center box and try again.');
    }
  };

  const simulateBarcodeScan = () => {
    const pool =
      catalogProducts.length > 0
        ? catalogProducts
        : [
            { id: 'prod-001', name: 'Spring Water Bottle', price: 1.5, image: '💧', barcode: '123456789012', category: 'Beverages' },
            { id: 'prod-009', name: 'Hungryman Instant Noodles', price: 1.2, image: '🍜', barcode: '901234567890', category: 'Food & Grocery' },
          ];
    const picked = pool[Math.floor(Math.random() * pool.length)];
    triggerProductMatch(picked, 'Tier 1: Simulated Barcode POS');
  };

  return (
    <div className="space-y-4">
      {/* Status Bar */}
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
              ? `POS Scanner Online • ${activeTier}`
              : backendStatus === 'checking'
              ? 'Starting POS Vision Engine...'
              : 'POS Engine Offline'}
          </span>
        </div>
        {isDetecting && (
          <span className="text-xs bg-emerald-200 text-emerald-800 px-2.5 py-0.5 rounded-full font-mono animate-pulse">
            ⚡ Scanning Product...
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

        {/* Product Reticle Box */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`w-72 h-52 border-2 rounded-2xl transition-all duration-200 relative flex items-center justify-center ${
              lastScannedProduct
                ? 'border-emerald-400 bg-emerald-500/15 scale-105 shadow-[0_0_30px_rgba(16,185,129,0.5)]'
                : isCapturing
                ? 'border-indigo-400/90 border-dashed'
                : 'border-white/30'
            }`}
          >
            {isCapturing && !lastScannedProduct && (
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-80 animate-pulse" />
            )}
            <span className="absolute -bottom-7 text-[11px] font-bold uppercase tracking-wider text-white bg-black/75 px-3 py-1 rounded-full shadow">
              {lastScannedProduct
                ? '✅ Product Matched!'
                : productNotFound
                ? '🔍 Product not found — Center item in box or Train below'
                : 'Place Product Inside Box'}
            </span>
          </div>
        </div>

        {/* Instant Detection Flash Banner with Real Captured Product Photo */}
        {lastScannedProduct && (
          <div className="absolute top-4 left-4 right-4 bg-emerald-600/95 backdrop-blur-md text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center justify-between animate-bounce">
            <div className="flex items-center space-x-3 font-bold text-sm sm:text-base">
              {getProductPhoto(lastScannedProduct) ? (
                <img
                  src={getProductPhoto(lastScannedProduct)!}
                  alt={lastScannedProduct.name}
                  className="w-11 h-11 rounded-lg object-cover border-2 border-white shadow-md shrink-0"
                />
              ) : (
                <span className="text-2xl">{lastScannedProduct.image}</span>
              )}
              <span>
                ✅ ADDED: {lastScannedProduct.name} — ${lastScannedProduct.price.toFixed(2)}
              </span>
            </div>
            <span className="text-xs bg-emerald-800 px-2 py-1 rounded font-semibold uppercase tracking-wider">
              Auto-Cart
            </span>
          </div>
        )}

        {/* Product Not Found Subtle Indicator (No human distraction) */}
        {!lastScannedProduct && productNotFound && isCapturing && (
          <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm text-amber-300 border border-amber-400/30 px-3 py-1 rounded-full text-xs font-semibold">
            🔍 Product not found
          </div>
        )}

        {/* Live Scanner Indicator */}
        <div className="absolute bottom-3 left-3">
          {isCapturing ? (
            <div className="flex items-center space-x-2 bg-black/75 backdrop-blur-sm px-3 py-1.5 rounded-full">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-white text-xs font-semibold">Hands-Free Product Focus ON</span>
            </div>
          ) : (
            <div className="bg-black/60 px-3 py-1.5 rounded-full text-white/70 text-xs">
              Scanner Paused
            </div>
          )}
        </div>
      </div>

      {/* Live Frame Telemetry (Humans filtered out) */}
      {lastDetection && lastDetection.detections.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Detected Product Candidates:
          </p>
          <div className="flex flex-wrap gap-2">
            {lastDetection.detections.map((det, i) => (
              <span
                key={i}
                className={`text-xs px-2.5 py-1 rounded-md font-medium flex items-center space-x-1.5 ${
                  det.product_id
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-semibold'
                    : 'bg-zinc-100 text-zinc-700'
                }`}
              >
                <span>{det.product_name ?? det.class_name}</span>
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
          className="bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2"
        >
          <span>🎯 {showTrainPanel ? 'Hide Product Trainer' : 'Train / Add Product'}</span>
        </button>

        <button
          onClick={simulateBarcodeScan}
          className="bg-zinc-800 hover:bg-zinc-900 text-white py-3 px-4 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2"
        >
          <span>📋 Simulate POS Scan</span>
        </button>
      </div>

      {/* Live Camera Product Capture, Training & Backend Registration Panel */}
      {showTrainPanel && (
        <div className="bg-indigo-50/95 border-2 border-indigo-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="font-extrabold text-indigo-950 text-sm sm:text-base flex items-center gap-1.5">
                <span>📸</span>
                <span>Train &amp; Add Product from Camera (Saves to Backend Catalog)</span>
              </h4>
              <p className="text-xs text-indigo-800 mt-0.5">
                Hold your product (e.g. <strong>VIVE Detergent</strong>) inside the center camera box above, enter its details below, and click{' '}
                <strong>Capture, Train &amp; Save</strong>.
              </p>
            </div>

            <div className="flex space-x-1.5 text-xs font-bold shrink-0">
              <button
                type="button"
                onClick={() => setTrainMode('new')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  trainMode === 'new'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-indigo-700 border border-indigo-200'
                }`}
              >
                ➕ Train New Product
              </button>
              <button
                type="button"
                onClick={() => setTrainMode('existing')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  trainMode === 'existing'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-indigo-700 border border-indigo-200'
                }`}
              >
                🔄 Re-Train Existing
              </button>
            </div>
          </div>

          {trainMode === 'new' ? (
            <form onSubmit={handleQuickTrain} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-bold text-indigo-900 uppercase mb-1">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. VIVE Detergent"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-indigo-300 text-sm bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-indigo-900 uppercase mb-1">
                    Price ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="e.g. 2.50"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-indigo-300 text-sm bg-white text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-bold text-indigo-900 uppercase mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    placeholder="Household & Cleaning"
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-indigo-300 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <span className="text-xs font-semibold text-indigo-800">
                  📷 Live camera snapshot of your product will be saved as its real picture
                </span>

                <button
                  type="submit"
                  disabled={isTraining}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold px-5 py-2.5 rounded-xl text-sm shadow-md transition-all shrink-0"
                >
                  {isTraining ? '⏳ Capturing Photo & Training...' : '📸 Capture Real Photo, Train & Save'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-indigo-300 text-sm bg-white font-medium text-slate-900"
              >
                {catalogProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {isRealImage(p.image) ? '📸' : p.image} {p.name} — ${p.price.toFixed(2)}{' '}
                    {p.has_visual_fingerprint ? ' (✅ Visually Trained)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isTraining}
                onClick={() => handleQuickTrain()}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-sm shadow"
              >
                {isTraining ? '⏳ Training...' : '📸 Capture & Update Fingerprint'}
              </button>
            </div>
          )}

          {trainFeedback && (
            <div className="text-xs font-bold text-indigo-950 bg-white px-3.5 py-2.5 rounded-xl border border-indigo-200 shadow-sm">
              {trainFeedback}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
