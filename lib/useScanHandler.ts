'use client';

import { useState, useCallback } from 'react';
import { getProductById, getProductByBarcode, Product } from '@/lib/products';
import { useCart } from '@/context/CartContext';
import { playSupermarketBeep } from '@/lib/audio';

export function useScanHandler() {
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { addItem } = useCart();

  const handleScan = useCallback(
    (identifier: string, explicitProduct?: Product) => {
      setIsLoading(true);

      // Resolve product: use direct object from backend or lookup in catalog
      const found = explicitProduct ??
                    getProductById(identifier) ??
                    getProductByBarcode(identifier) ??
                    null;

      setScannedProduct(found);
      setIsLoading(false);

      if (found) {
        // 1. Play the crisp supermarket checkout beep
        playSupermarketBeep();

        // 2. Add product directly to cart
        addItem({
          id: found.id,
          name: found.name,
          price: found.price,
          image: found.image,
          barcode: found.barcode,
        });

        // 3. Set temporary visual notification banner
        setRecentlyAdded(found);
        setTimeout(() => {
          setRecentlyAdded((current) => (current?.id === found.id ? null : current));
        }, 3500);
      }
    },
    [addItem]
  );

  const clearProduct = useCallback(() => {
    setScannedProduct(null);
    setRecentlyAdded(null);
  }, []);

  return {
    scannedProduct,
    recentlyAdded,
    isLoading,
    handleScan,
    clearProduct
  };
}
