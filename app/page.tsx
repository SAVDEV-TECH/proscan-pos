'use client';

import Link from 'next/link';
import { Suspense, lazy } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProductDisplay } from '../components/ProductDisplay';
import { CartSummary } from '../components/CartSummary';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useScanHandler } from '../lib/useScanHandler';
import { getProductPhoto } from '../lib/products';

const CameraScanner = lazy(() =>
  import('../components/ScannerComponent').then((m) => ({ default: m.CameraScanner }))
);

function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">🛒 Proscan</h1>
          <p className="text-xl text-gray-700 mb-2">E-commerce with Smart Product Scanning</p>
          <p className="text-gray-600">Powered by Next.js, FastAPI, and YOLOv8</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">✅ Setup Complete!</h2>

          <div className="space-y-4 mb-8">
            {[
              ['Phase 1: Foundation', 'Configuration files created and installed'],
              ['Dependencies Installed', '1,142 packages ready to use'],
              ['Scanner Feature', 'Auto-add products to cart on scan'],
              ['Tailwind CSS', 'Beautiful responsive design ready'],
            ].map(([title, desc]) => (
              <div key={title} className="flex items-start">
                <span className="text-green-500 mr-3 text-xl">✓</span>
                <div>
                  <h3 className="font-semibold text-gray-900">{title}</h3>
                  <p className="text-gray-600">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-8">
            <h3 className="font-semibold text-gray-900 mb-4">Tech Stack</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Framework', 'Next.js 14'],
                ['Language', 'TypeScript 5'],
                ['State', 'React Context'],
                ['ML Backend', 'FastAPI + YOLOv8'],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-sm text-gray-600">{label}</p>
                  <p className="font-semibold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="font-semibold text-gray-900 mb-4">🚀 Next Steps</h3>
            <ol className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <span className="font-bold text-indigo-600 mr-3">1.</span>
                <span>Click &quot;Try Scanner Demo&quot; below</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-indigo-600 mr-3">2.</span>
                <span>Simulate scanning products</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-indigo-600 mr-3">3.</span>
                <span>Watch auto-add to cart feature</span>
              </li>
            </ol>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/?demo=true"
            className="w-full sm:w-auto inline-block px-8 py-3.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 hover:shadow-indigo-500/25 transition-all text-center"
          >
            🚀 Open Smart Scanner
          </Link>
          <Link
            href="/inventory"
            className="w-full sm:w-auto inline-block px-8 py-3.5 bg-white text-slate-800 font-bold rounded-xl border border-slate-300 shadow-sm hover:bg-slate-50 transition-all text-center"
          >
            📦 Manage Dynamic Inventory
          </Link>
        </div>
        <p className="text-sm text-gray-600 mt-4 text-center">Add custom items, edit prices, or point camera to auto-scan!</p>
      </div>
    </main>
  );
}

function ScannerDemoContent() {
  const { scannedProduct, recentlyAdded, isLoading, handleScan } = useScanHandler();

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-indigo-600 hover:text-indigo-700 font-semibold text-sm">
            ← Back to Home
          </Link>
          <Link
            href="/inventory"
            className="bg-white/80 backdrop-blur-sm px-3.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center space-x-1.5"
          >
            <span>📦</span>
            <span>Dynamic Inventory & Catalog</span>
          </Link>
        </div>

        {/* Real-time Supermarket Auto-Add Toast Notification */}
        {recentlyAdded && (
          <div className="mb-6 p-4 bg-emerald-600 text-white rounded-2xl shadow-xl flex items-center justify-between border-2 border-emerald-400 animate-pulse">
            <div className="flex items-center space-x-3">
              {getProductPhoto(recentlyAdded) ? (
                <img
                  src={getProductPhoto(recentlyAdded)!}
                  alt={recentlyAdded.name}
                  className="w-14 h-14 rounded-xl object-cover border-2 border-white shadow-md shrink-0"
                />
              ) : (
                <span className="text-4xl">{recentlyAdded.image}</span>
              )}
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
          <p className="text-gray-600">Point camera at products — items automatically detect and add to your cart!</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card">
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

            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">📦 Scanned Product</h2>
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
          <div className="card text-center">
            <div className="text-4xl mb-2">📸</div>
            <h3 className="font-bold text-gray-900 mb-1">1. Scan</h3>
            <p className="text-sm text-gray-600">Click simulate</p>
          </div>
          <div className="card text-center">
            <div className="text-4xl mb-2">✨</div>
            <h3 className="font-bold text-gray-900 mb-1">2. Recognize</h3>
            <p className="text-sm text-gray-600">Product appears</p>
          </div>
          <div className="card text-center">
            <div className="text-4xl mb-2">🛒</div>
            <h3 className="font-bold text-gray-900 mb-1">3. Auto-Add</h3>
            <p className="text-sm text-gray-600">Auto to cart</p>
          </div>
        </div>
      </div>
    </main>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const showDemo = searchParams.get('demo') === 'true';
  return showDemo ? <ScannerDemoContent /> : <HomePage />;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100" />}>
      <HomeContent />
    </Suspense>
  );
}
