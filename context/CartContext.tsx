'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  barcode?: string;
}

export interface PosReceipt {
  id: string;
  date: string;
  time: string;
  cashier: string;
  method: 'POS Card' | 'Cash' | 'Transfer';
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountTendered?: number;
  changeDue?: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
  salesHistory: PosReceipt[];
  recordSale: (receipt: PosReceipt) => void;
}

const CART_STORAGE_KEY = 'proscan_active_cart_v1';
const SALES_STORAGE_KEY = 'proscan_sales_history_v1';

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [salesHistory, setSalesHistory] = useState<PosReceipt[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on client mount
  useEffect(() => {
    try {
      const savedCart = window.localStorage.getItem(CART_STORAGE_KEY);
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed)) setItems(parsed);
      }
      const savedSales = window.localStorage.getItem(SALES_STORAGE_KEY);
      if (savedSales) {
        const parsedSales = JSON.parse(savedSales);
        if (Array.isArray(parsedSales)) setSalesHistory(parsedSales);
      }
    } catch {
      // ignore storage errors
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist cart items
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage errors
    }
  }, [items, hydrated]);

  // Persist sales history
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(salesHistory.slice(0, 30)));
    } catch {
      // ignore storage errors
    }
  }, [salesHistory, hydrated]);

  const addItem = (item: Omit<CartItem, 'quantity'>) => {
    setItems((prevItems) => {
      const existingItem = prevItems.find((i) => i.id === item.id);

      if (existingItem) {
        return prevItems.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }

      return [...prevItems, { ...item, quantity: 1 }];
    });
  };

  const removeItem = (id: string) => {
    setItems((prevItems) => prevItems.filter((i) => i.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems((prevItems) =>
      prevItems.map((i) => (i.id === id ? { ...i, quantity } : i))
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const recordSale = (receipt: PosReceipt) => {
    setSalesHistory((prev) => [receipt, ...prev.slice(0, 29)]);
  };

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items]
  );

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        total,
        itemCount,
        salesHistory,
        recordSale,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}

