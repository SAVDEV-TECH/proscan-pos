'use client';

import { Product, getProductPhoto } from '@/lib/products';
import { useCart } from '@/context/CartContext';

interface ProductDisplayProps {
  product: Product | null;
  isLoading: boolean;
  onAddToCart?: (product: Product) => void;
}

export function ProductDisplay({
  product,
  isLoading,
  onAddToCart,
}: ProductDisplayProps) {
  const { addItem } = useCart();

  const handleAddToCart = () => {
    if (!product) return;

    if (onAddToCart) {
      onAddToCart(product);
    } else {
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        image: getProductPhoto(product) || product.image,
        barcode: product.barcode,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="card animate-pulse flex items-center gap-3.5 p-3.5">
        <div className="w-16 h-16 bg-gray-200 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
        </div>
      </div>
    );
  }

  if (!product) {
    return null;
  }

  const realPhoto = getProductPhoto(product);

  return (
    <div className="card p-3.5 sm:p-4 flex items-center justify-between gap-3.5">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {realPhoto ? (
          <img
            src={realPhoto}
            alt={product.name}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border-2 border-emerald-400 shadow-sm shrink-0"
          />
        ) : (
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-slate-100 flex items-center justify-center text-3xl sm:text-4xl shrink-0">
            {product.image}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">
              {product.category}
            </span>
            <span className="font-mono text-[10px] text-slate-400 truncate">
              #{product.barcode}
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 truncate">
            {product.name}
          </h2>
          <p className="text-lg sm:text-xl font-extrabold text-emerald-600">
            ${product.price.toFixed(2)}
          </p>
        </div>
      </div>

      <button
        onClick={handleAddToCart}
        className="btn-primary min-h-[42px] px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold shrink-0"
      >
        + Cart
      </button>
    </div>
  );
}
