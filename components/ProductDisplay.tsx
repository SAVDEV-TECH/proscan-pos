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
      <div className="card animate-pulse">
        <div className="h-24 sm:h-32 bg-gray-300 rounded-xl mb-3 sm:mb-4" />
        <div className="h-5 sm:h-6 bg-gray-300 rounded mb-2" />
        <div className="h-4 bg-gray-300 rounded w-2/3" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="card text-center py-6 sm:py-8 text-gray-500">
        <div className="text-3xl sm:text-4xl mb-2">📦</div>
        <p className="font-medium text-gray-700 text-sm sm:text-base">No product scanned yet</p>
        <p className="text-xs sm:text-sm mt-0.5">Show a product to the camera to see its photo and price</p>
      </div>
    );
  }

  const realPhoto = getProductPhoto(product);

  return (
    <div className="card space-y-3.5 sm:space-y-4">
      <div className="flex items-center sm:flex-col sm:items-stretch gap-3.5 sm:gap-0">
        <div className="flex justify-center shrink-0 sm:mb-4">
          {realPhoto ? (
            <img
              src={realPhoto}
              alt={product.name}
              className="w-20 h-20 sm:w-44 sm:h-44 rounded-2xl object-cover border-2 border-emerald-400 shadow-md sm:shadow-lg"
            />
          ) : (
            <div className="w-20 h-20 sm:w-auto sm:h-auto rounded-2xl bg-slate-100 sm:bg-transparent flex items-center justify-center text-4xl sm:text-6xl text-center">
              {product.image}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 mb-1">
            {product.category}
          </span>
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 break-words leading-tight">
            {product.name}
          </h2>
          {product.description && (
            <p className="text-xs sm:text-sm text-gray-600 mt-1 line-clamp-2 sm:line-clamp-none">
              {product.description}
            </p>
          )}
        </div>
      </div>

      <div className="bg-gray-100 px-3 py-2 sm:p-3 rounded-lg border border-gray-200 flex items-center justify-between sm:block">
        <p className="text-xs text-gray-600 sm:mb-0.5">Barcode</p>
        <p className="font-mono text-xs sm:text-sm font-bold text-gray-900 truncate">{product.barcode}</p>
      </div>

      <div className="flex items-center justify-between gap-3 pt-3 sm:pt-4 border-t">
        <div>
          <p className="text-xs sm:text-sm text-gray-600">Price</p>
          <p className="text-2xl sm:text-3xl font-bold text-green-600">
            ${product.price.toFixed(2)}
          </p>
        </div>

        <button
          onClick={handleAddToCart}
          className="btn-primary min-h-[44px] px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-bold shrink-0"
        >
          🛒 Add to Cart
        </button>
      </div>
    </div>
  );
}
