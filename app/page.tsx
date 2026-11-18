'use client';

import Link from 'next/link';
import { Suspense, lazy } from 'react';
import { ProductDisplay } from '../components/ProductDisplay';
import { CartSummary } from '../components/CartSummary';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useScanHandler } from '../lib/useScanHandler';
import { getProductPhoto } from '../lib/products';
import { CartIcon, PackageIcon, ProductThumbnail } from '../components/Icons';

const CameraScanner = lazy(() =>
  import('../components/ScannerComponent').then((m) => ({ default: m.CameraScanner }))
);

export default function Home() {
  const { scannedProduct, recentlyAdded, isLoading, handleScan } = useScanHandler();

  return (
    <main className="min-h-screen bg-slate-50 px-3.5 pt-3.5 pb-24 sm:p-6 lg:pb-10">
      <div className="max-w-7xl mx-auto">
        {/* Clean Minimal Top Bar */}
        <header className="mb-4 flex items-center justify-between gap-2 bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-sm">
          <Link href="/" className="font-extrabold text-lg sm:text-xl text-slate-900 flex items-center space-x-2">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <CartIcon className="w-4 h-4" />
            </span>
            <span>Proscan POS</span>
          </Link>
          <Link
            href="/inventory"
            className="bg-slate-100 hover:bg-indigo-50 text-slate-800 hover:text-indigo-700 px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-colors flex items-center space-x-1.5"
          >
            <PackageIcon className="w-4 h-4" />
            <span>Inventory</span>
          </Link>
        </header>

        {/* Compact Auto-Add Toast */}
        {recentlyAdded && (
          <div className="mb-4 p-3 bg-emerald-600 text-white rounded-2xl shadow-lg flex items-center justify-between gap-3 border border-emerald-400">
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              <ProductThumbnail
                src={getProductPhoto(recentlyAdded)}
                name={recentlyAdded.name}
                category={recentlyAdded.category}
                className="w-10 h-10 rounded-xl"
              />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm truncate">Added {recentlyAdded.name}</p>
                <p className="text-emerald-100 text-xs font-semibold">
                  ${recentlyAdded.price.toFixed(2)}
                </p>
              </div>
            </div>
            <span className="bg-white/20 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase shrink-0">
              +1 Cart
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="card">
              <ErrorBoundary
                fallback={
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-900">
                    Camera unavailable — use Simulate below.
                  </div>
                }
              >
                <Suspense fallback={<div className="h-56 bg-slate-100 rounded-xl animate-pulse" />}>
                  <CameraScanner onScan={handleScan} isScanning={true} />
                </Suspense>
              </ErrorBoundary>
            </div>

            {(scannedProduct || isLoading) && (
              <ProductDisplay product={scannedProduct} isLoading={isLoading} />
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <CartSummary />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
