'use client';

import { Suspense, lazy } from 'react';
import Link from 'next/link';
import { ProductDisplay } from '../../components/ProductDisplay';
import { CartSummary } from '../../components/CartSummary';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useScanHandler } from '../../lib/useScanHandler';

const CameraScanner = lazy(() =>
  import('../../components/ScannerComponent').then((m) => ({ default: m.CameraScanner }))
);

function ScannerContent() {
  const { scannedProduct, recentlyAdded, isLoading, handleScan } = useScanHandler();

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <Link href="/" className="text-indigo-600 hover:text-indigo-700 font-semibold">
            ← Back to Home
          </Link>
        </div>

        {/* Real-time Supermarket Auto-Add Toast Notification */}
        {recentlyAdded && (
          <div className="mb-6 p-4 bg-emerald-600 text-white rounded-2xl shadow-xl flex items-center justify-between border-2 border-emerald-400 animate-pulse">
            <div className="flex items-center space-x-3">
              <span className="text-4xl">{recentlyAdded.image}</span>
              <div>
                <p className="font-bold text-lg">🛒 Added {recentlyAdded.name} to cart!</p>
                <p className="text-emerald-100 text-sm font-medium">Price: ${recentlyAdded.price.toFixed(2)} • Category: {recentlyAdded.category}</p>
              </div>
            </div>
            <span className="bg-white/20 backdrop-blur-sm px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
              Auto-Added
            </span>
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">📱 Smart Product Scanner</h1>
          <p className="text-gray-600">Point camera at products — they automatically add to cart!</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">📷 Camera Scanner</h2>
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

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">📦 Detected Product</h2>
              <ProductDisplay product={scannedProduct} isLoading={isLoading} />
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <CartSummary />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-4xl mb-2">📸</div>
            <h3 className="font-bold text-gray-900 mb-1">1. Scan</h3>
            <p className="text-sm text-gray-600">Point camera at products</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-4xl mb-2">✨</div>
            <h3 className="font-bold text-gray-900 mb-1">2. Recognize</h3>
            <p className="text-sm text-gray-600">YOLO detects the product</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-4xl mb-2">🛒</div>
            <h3 className="font-bold text-gray-900 mb-1">3. Auto-Add</h3>
            <p className="text-sm text-gray-600">Added to cart instantly</p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ScannerPage() {
  return <ScannerContent />;
}
