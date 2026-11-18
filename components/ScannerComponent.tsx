'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useBackendDetection } from '@/lib/useBackendDetection';
import { Product, PRODUCTS, getProductPhoto, isRealImage } from '@/lib/products';
import { fetchProducts } from '@/lib/api';
import { playErrorBuzz } from '@/lib/audio';

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
  } = useBackendDetection();

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

  // Poll health & sync catalog
  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      const isHealthy = await checkBackendHealth();
      if (!mounted) return;
      setBackendStatus(isHealthy ? 'connected' : 'disconnected');
      const items = await fetchProducts();
      if (mounted && items.length > 0) {
        setCatalogProducts(items);
        if (!selectedProductId) {
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

  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');

  // Initialize camera stream & detect hardware torch support
  useEffect(() => {
    if (!isScanning) return;
    const videoEl = videoRef.current;

    const startCamera = async () => {
      try {
        if (videoEl?.srcObject) {
          const oldTracks = (videoEl.srcObject as MediaStream).getTracks();
          oldTracks.forEach((track) => track.stop());
        }
        setTorchOn(false);
        setTorchSupported(false);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: cameraFacing,
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });

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
  }, [isScanning, cameraFacing]);

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
                triggerProductMatch(localMatch);
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
            triggerProductMatch(prod);
          }
        } else {
          candidateIdRef.current = null;
          candidateHitsRef.current = 0;
          setProductNotFound(true);
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
        <div className="flex items-center space-x-1.5 min-w-0">
          <span className="shrink-0">
            {backendStatus === 'connected' ? '🟢' : backendStatus === 'checking' ? '🟡' : '⚪'}
          </span>
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
            <span className="text-[11px] bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-full font-mono animate-pulse">
              ⚡
            </span>
          )}
          <button
            type="button"
            onClick={toggleVoicePos}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
              voiceEnabled
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-300'
            }`}
          >
            {voiceEnabled ? '🔊 Voice' : '🔇 Muted'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-xl text-xs flex items-center space-x-2">
          <span className="shrink-0">⚠️</span>
          <span className="break-words">{error}</span>
        </div>
      )}

      {/* Video Viewport */}
      <div className="relative bg-zinc-950 rounded-xl overflow-hidden aspect-[4/3] sm:aspect-video min-h-[220px] border-2 border-zinc-800 shadow-inner">
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

        {/* Product Reticle Box with Corner L-Brackets */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6 sm:p-8">
          <div
            className={`w-full max-w-[16rem] sm:max-w-[18rem] h-full max-h-[9.5rem] sm:max-h-[13rem] border rounded-2xl transition-all duration-200 relative flex items-center justify-center ${
              lastScannedProduct
                ? 'border-emerald-400 bg-emerald-500/15 scale-105 shadow-[0_0_35px_rgba(16,185,129,0.6)]'
                : isCapturing
                ? 'border-indigo-400/50 border-dashed'
                : 'border-white/25'
            }`}
          >
            <span className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
            <span className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

            {isCapturing && !lastScannedProduct && (
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_12px_#f43f5e] opacity-90 animate-pulse" />
            )}

            <span className="absolute bottom-2 max-w-[92%] truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white bg-black/75 px-2.5 py-0.5 rounded-full">
              {lastScannedProduct
                ? '✅ Matched'
                : productNotFound
                ? '🔍 Not Found'
                : 'Scan Item'}
            </span>
          </div>
        </div>

        {/* Instant Detection Flash Banner */}
        {lastScannedProduct && (
          <div className="absolute top-2.5 left-2.5 right-2.5 bg-emerald-600/95 backdrop-blur-md text-white px-3 py-2 rounded-xl shadow-xl flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 font-bold text-xs sm:text-sm min-w-0">
              {getProductPhoto(lastScannedProduct) ? (
                <img
                  src={getProductPhoto(lastScannedProduct)!}
                  alt={lastScannedProduct.name}
                  className="w-8 h-8 rounded-lg object-cover border border-white shrink-0"
                />
              ) : (
                <span className="text-lg shrink-0">{lastScannedProduct.image}</span>
              )}
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
                <span>🔦</span>
                <span>Light</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))}
              className="bg-black/75 hover:bg-black/90 active:scale-95 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full border border-white/20 backdrop-blur-sm transition-all flex items-center space-x-1"
            >
              <span>🔄</span>
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
          className={`min-h-[42px] py-2 px-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all active:scale-[0.98] flex items-center justify-center space-x-1 ${
            backendStatus !== 'connected'
              ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
              : isCapturing
              ? 'bg-rose-600 hover:bg-rose-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          <span>{isCapturing ? '⏹️ Pause' : '▶️ Resume'}</span>
        </button>

        <button
          type="button"
          onClick={simulateBarcodeScan}
          className="min-h-[42px] bg-zinc-800 hover:bg-zinc-900 text-white py-2 px-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all active:scale-[0.98] flex items-center justify-center space-x-1"
        >
          <span>📋 Simulate</span>
        </button>

        <button
          type="button"
          onClick={() => setShowTrainPanel((prev) => !prev)}
          className={`min-h-[42px] py-2 px-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all active:scale-[0.98] flex items-center justify-center space-x-1 ${
            showTrainPanel
              ? 'bg-indigo-700 text-white'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
        >
          <span>🎯 Train</span>
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
              className="w-full pl-7 pr-2.5 py-1.5 rounded-lg border border-slate-300 text-base sm:text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="absolute left-2 top-2 sm:top-1.5 text-slate-400 text-xs">⌨️</span>
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
              className="flex items-center space-x-1 bg-white hover:bg-indigo-50 active:scale-95 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 shrink-0"
            >
              <span>{isRealImage(item.image) ? '📸' : item.image}</span>
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
            <h4 className="font-bold text-indigo-950 text-xs sm:text-sm">📸 Train Product</h4>

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
                🔄 Existing
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
                className="w-full min-h-[40px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-xs shadow-sm active:scale-[0.98]"
              >
                {isTraining ? '⏳ Saving...' : '📸 Capture & Save'}
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
                    {isRealImage(p.image) ? '📸' : p.image} {p.name} (${p.price.toFixed(2)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isTraining}
                onClick={() => handleQuickTrain()}
                className="w-full sm:w-auto min-h-[40px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-xs"
              >
                {isTraining ? '⏳...' : '📸 Update'}
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
