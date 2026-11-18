import { Product, PRODUCTS } from '@/lib/products';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
const STORAGE_KEY = 'proscan_catalog_v2';

function getLocalCatalog(): Product[] {
  if (typeof window === 'undefined') return PRODUCTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return PRODUCTS;
}

function saveLocalCatalog(items: Product[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

function isLocalhostEnv(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

export async function fetchProducts(): Promise<Product[]> {
  if (isLocalhostEnv() || process.env.NEXT_PUBLIC_BACKEND_URL) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1800);
      const res = await fetch(`${BACKEND_URL}/products`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        saveLocalCatalog(data);
        return data;
      }
    } catch {
      // Fall back to cloud/browser catalog
    }
  }
  return getLocalCatalog();
}

export async function createProduct(product: Omit<Product, 'id'> & { id?: string }): Promise<Product> {
  if (isLocalhostEnv() || process.env.NEXT_PUBLIC_BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      });
      if (res.ok) {
        const created = await res.json();
        const current = getLocalCatalog();
        saveLocalCatalog([created, ...current.filter((p) => p.id !== created.id)]);
        return created;
      }
    } catch {
      // Fall back to local catalog persistence
    }
  }

  const newProd: Product = {
    id: product.id || `prod-${Math.random().toString(36).substring(2, 8)}`,
    name: product.name,
    price: Number(product.price),
    image: product.image || '📦',
    barcode: product.barcode || String(Math.floor(100000000000 + Math.random() * 900000000000)),
    category: product.category || 'General',
    description: product.description || '',
    yolo_classes: (product.yolo_classes || '').toLowerCase().trim(),
    has_visual_fingerprint: Boolean(product.has_visual_fingerprint),
    reference_image: product.reference_image,
  };
  const updated = [newProd, ...getLocalCatalog()];
  saveLocalCatalog(updated);
  return newProd;
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
  if (isLocalhostEnv() || process.env.NEXT_PUBLIC_BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updatedItem = await res.json();
        const list = getLocalCatalog().map((p) => (p.id === id ? updatedItem : p));
        saveLocalCatalog(list);
        return updatedItem;
      }
    } catch {
      // Fall back to local catalog update
    }
  }

  const list = getLocalCatalog();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error('Product not found');
  const updatedItem: Product = { ...list[idx], ...updates };
  list[idx] = updatedItem;
  saveLocalCatalog(list);
  return updatedItem;
}

export async function deleteProduct(id: string): Promise<boolean> {
  if (isLocalhostEnv() || process.env.NEXT_PUBLIC_BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/products/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        saveLocalCatalog(getLocalCatalog().filter((p) => p.id !== id));
        return true;
      }
    } catch {
      // Fall back to local catalog delete
    }
  }

  saveLocalCatalog(getLocalCatalog().filter((p) => p.id !== id));
  return true;
}

export async function fetchDetectionClasses(): Promise<string[]> {
  if (isLocalhostEnv() || process.env.NEXT_PUBLIC_BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/classes`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.classes) return data.classes;
      }
    } catch {
      // Fall back to standard COCO list
    }
  }
  return [
    'bottle', 'cup', 'apple', 'banana', 'orange', 'sandwich', 'book',
    'cell phone', 'bowl', 'scissors', 'fork', 'knife', 'spoon', 'laptop',
    'mouse', 'keyboard', 'tv', 'microwave', 'toaster', 'sink', 'refrigerator',
    'clock', 'vase', 'teddy bear', 'toothbrush', 'backpack', 'umbrella',
    'handbag', 'wine glass', 'sports ball', 'hot dog', 'pizza', 'donut', 'cake',
  ];
}
