'use client';

import { Suspense, lazy } from 'react';
import Link from 'next/link';
import { ProductDisplay } from '../../components/ProductDisplay';
import { CartSummary } from '../../components/CartSummary';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useScanHandler } from '../../lib/useScanHandler';
import { getProductPhoto } from '../../lib/products';

const CameraScanner = lazy(() =>
  import('../../components/ScannerComponent').then((m) => ({ default: m.CameraScanner }))
);

function ScannerContent() {
  const { scannedProduct, recentlyAdded, isLoading, handleScan } = useScanHandler();

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-3.5 pt-3.5 pb-24 sm:p-6 lg:pb-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-3 sm:mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link href="/" className="text-indigo-600 hover:text-indigo-700 font-semibold text-xs sm:text-sm py-1.5">
            ← Back to Home
          </Link>
          <Link
            href="/inventory"
            className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center space-x-1.5"
          >
            <span>📦</span>
            <span>Inventory &amp; Catalog</span>
          </Link>
        </div>

        {/* Real-time Supermarket Auto-Add Toast Notification */}
        {recentlyAdded && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-emerald-600 text-white rounded-2xl shadow-xl flex items-center justify-between gap-3 border-2 border-emerald-400 animate-pulse">
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              {getProductPhoto(recentlyAdded) ? (
                <img
                  src={getProductPhoto(recentlyAdded)!}
                  alt={recentlyAdded.name}
                  className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl object-cover border-2 border-white shadow-md shrink-0"
                />
              ) : (
                <span className="text-3xl sm:text-4xl shrink-0">{recentlyAdded.image}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm sm:text-lg truncate">🛒 Added {recentlyAdded.name} to cart!</p>
                <p className="text-emerald-100 text-xs sm:text-sm font-medium truncate">
                  Price: ${recentlyAdded.price.toFixed(2)} • {recentlyAdded.category}
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block bg-white/20 backdrop-blur-sm px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shrink-0">
              Auto-Added
            </span>
          </div>
        )}

        <div className="mb-4 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">📱 Smart Product Scanner</h1>
          <p className="text-xs sm:text-base text-gray-600">
            Point camera at products — they automatically add to cart!
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="card">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">📷 Camera Scanner</h2>
              <ErrorBoundary
                fallback={
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-900">
                    Camera unavailable — use &quot;Simulate Scan&quot; below.
                  </div>
                }
              >
                <Suspense fallback={<div className="h-48 bg-gray-100 rounded-lg animate-pulse" />}>
                  <CameraScanner onScan={handleScan} isScanning={true} />
                </Suspense>
              </ErrorBoundary>
            </div>

            <div className="card">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">📦 Detected Product</h2>
              <ProductDisplay product={scannedProduct} isLoading={isLoading} />
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <CartSummary />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:gap-6 mt-6 sm:mt-8">
          <div className="card text-center p-3 sm:p-6">
            <div className="text-2xl sm:text-4xl mb-1 sm:mb-2">📸</div>
            <h3 className="font-bold text-gray-900 text-xs sm:text-base mb-0.5 sm:mb-1">1. Scan</h3>
            <p className="text-[11px] sm:text-sm text-gray-600">Point camera</p>
          </div>
          <div className="card text-center p-3 sm:p-6">
            <div className="text-2xl sm:text-4xl mb-1 sm:mb-2">✨</div>
            <h3 className="font-bold text-gray-900 text-xs sm:text-base mb-0.5 sm:mb-1">2. Recognize</h3>
            <p className="text-[11px] sm:text-sm text-gray-600">YOLO detects item</p>
          </div>
          <div className="card text-center p-3 sm:p-6">
            <div className="text-2xl sm:text-4xl mb-1 sm:mb-2">🛒</div>
            <h3 className="font-bold text-gray-900 text-xs sm:text-base mb-0.5 sm:mb-1">3. Auto-Add</h3>
            <p className="text-[11px] sm:text-sm text-gray-600">Instant cart</p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ScannerPage() {
  return <ScannerContent />;
}
