import { Product, PRODUCTS } from '@/lib/products';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
const STORAGE_KEY = 'proscan_catalog_v2';

export function getLocalCatalog(): Product[] {
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

export function saveLocalCatalog(items: Product[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

function mergeCatalogs(serverItems: Product[], localItems: Product[]): Product[] {
  const map = new Map<string, Product>();
  for (const item of serverItems) {
    map.set(item.id, item);
  }
  for (const local of localItems) {
    const existing = map.get(local.id);
    if (!existing) {
      map.set(local.id, local);
    } else if (local.has_visual_fingerprint && !existing.has_visual_fingerprint) {
      map.set(local.id, {
        ...existing,
        has_visual_fingerprint: true,
        reference_image: local.reference_image || existing.reference_image,
        visual_embeddings: local.visual_embeddings || existing.visual_embeddings,
      });
    }
  }
  return Array.from(map.values());
}

function isLocalhostEnv(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

export async function fetchProducts(): Promise<Product[]> {
  const localItems = getLocalCatalog();

  // 1. Try Next.js Server Backend API (/api/products)
  try {
    const res = await fetch('/api/products', { cache: 'no-store' });
    if (res.ok) {
      const serverData: Product[] = await res.json();
      const merged = mergeCatalogs(serverData, localItems);
      saveLocalCatalog(merged);
      return merged;
    }
  } catch {
    // ignore and try Python backend or local
  }

  // 2. Try Python FastAPI backend if on localhost
  if (isLocalhostEnv() || process.env.NEXT_PUBLIC_BACKEND_URL) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${BACKEND_URL}/products`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const merged = mergeCatalogs(data, localItems);
        saveLocalCatalog(merged);
        return merged;
      }
    } catch {
      // Fall back to local catalog
    }
  }

  return localItems;
}

export async function createProduct(product: Omit<Product, 'id'> & { id?: string }): Promise<Product> {
  // 1. Save to Next.js Server Backend (/api/products)
  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    if (res.ok) {
      const created: Product = await res.json();
      const current = getLocalCatalog();
      saveLocalCatalog([created, ...current.filter((p) => p.id !== created.id)]);

      // Also sync to local Python FastAPI if running
      if (isLocalhostEnv()) {
        fetch(`${BACKEND_URL}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(created),
        }).catch(() => {});
      }
      return created;
    }
  } catch {
    // Fall back to local creation
  }

  const newProd: Product = {
    id: product.id || `prod-${Date.now().toString(36)}`,
    name: product.name,
    price: Number(product.price),
    image: product.image || '📦',
    barcode: product.barcode || String(Math.floor(100000000000 + Math.random() * 900000000000)),
    category: product.category || 'General',
    description: product.description || 'Trained via Proscan Camera',
    yolo_classes: (product.yolo_classes || '').toLowerCase().trim(),
    has_visual_fingerprint: Boolean(product.has_visual_fingerprint || product.visual_embeddings?.length),
    reference_image: product.reference_image,
    visual_embeddings: product.visual_embeddings,
  };
  const updated = [newProd, ...getLocalCatalog()];
  saveLocalCatalog(updated);
  return newProd;
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updatedItem: Product = await res.json();
      const list = getLocalCatalog().map((p) => (p.id === id ? updatedItem : p));
      saveLocalCatalog(list);
      return updatedItem;
    }
  } catch {
    // Fall back to local update
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
  try {
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
  } catch {
    // ignore
  }
  if (isLocalhostEnv()) {
    fetch(`${BACKEND_URL}/products/${id}`, { method: 'DELETE' }).catch(() => {});
  }
  saveLocalCatalog(getLocalCatalog().filter((p) => p.id !== id));
  return true;
}

export async function fetchDetectionClasses(): Promise<string[]> {
  return [
    'bottle', 'cup', 'apple', 'banana', 'orange', 'sandwich', 'book',
    'cell phone', 'bowl', 'scissors', 'fork', 'knife', 'spoon', 'laptop',
    'mouse', 'keyboard', 'tv', 'microwave', 'toaster', 'sink', 'refrigerator',
    'clock', 'vase', 'teddy bear', 'toothbrush', 'backpack', 'umbrella',
    'handbag', 'wine glass', 'sports ball', 'hot dog', 'pizza', 'donut', 'cake',
  ];
}
