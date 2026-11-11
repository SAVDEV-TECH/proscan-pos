'use client';

import { Product } from '@/lib/products';
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
        image: product.image,
        barcode: product.barcode,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-32 bg-gray-300 rounded mb-4" />
        <div className="h-6 bg-gray-300 rounded mb-2" />
        <div className="h-4 bg-gray-300 rounded" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="card text-center py-8 text-gray-500">
        <div className="text-4xl mb-2">📦</div>
        <p>No product scanned yet</p>
        <p className="text-sm">Scan a barcode or use camera to see product details</p>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="text-6xl text-center mb-4">{product.image}</div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900">{product.name}</h2>
        <p className="text-sm text-gray-600 mt-1">{product.category}</p>
      </div>

      <p className="text-gray-700">{product.description}</p>

      <div className="bg-gray-100 p-3 rounded border border-gray-300">
        <p className="text-xs text-gray-600 mb-1">Barcode</p>
        <p className="font-mono text-sm font-bold">{product.barcode}</p>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <div>
          <p className="text-sm text-gray-600">Price</p>
          <p className="text-3xl font-bold text-green-600">
            ${product.price.toFixed(2)}
          </p>
        </div>

        <button onClick={handleAddToCart} className="btn-primary px-6 py-3">
          🛒 Add to Cart
        </button>
      </div>
    </div>
  );
}
