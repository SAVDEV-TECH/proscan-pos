'use client';

import { useState, useCallback } from 'react';
import { getProductById, getProductByBarcode, getProductPhoto, Product } from '@/lib/products';
import { useCart } from '@/context/CartContext';
import { playSupermarketBeep, speakPosAnnouncement } from '@/lib/audio';

export function useScanHandler() {
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { addItem } = useCart();

  const handleScan = useCallback(
    (identifier: string, explicitProduct?: Product) => {
      setIsLoading(true);

      const found = explicitProduct ??
                    getProductById(identifier) ??
                    getProductByBarcode(identifier) ??
                    null;

      setScannedProduct(found);
      setIsLoading(false);

      if (found) {
        playSupermarketBeep();
        speakPosAnnouncement(`${found.name}, $${found.price.toFixed(2)}`);

        const displayImage = getProductPhoto(found) || found.image;

        addItem({
          id: found.id,
          name: found.name,
          price: found.price,
          image: displayImage,
          barcode: found.barcode,
        });

        setRecentlyAdded({ ...found, image: displayImage });
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
