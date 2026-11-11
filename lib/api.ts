import { Product } from '@/lib/products';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

export async function fetchProducts(): Promise<Product[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/products`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn('[API] Could not fetch products from backend, falling back to local catalog:', err);
    const { PRODUCTS } = await import('@/lib/products');
    return PRODUCTS;
  }
}

export async function createProduct(product: Omit<Product, 'id'> & { id?: string }): Promise<Product> {
  const res = await fetch(`${BACKEND_URL}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to create product');
  }
  return await res.json();
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
  const res = await fetch(`${BACKEND_URL}/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to update product');
  }
  return await res.json();
}

export async function deleteProduct(id: string): Promise<boolean> {
  const res = await fetch(`${BACKEND_URL}/products/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to delete product');
  }
  return true;
}

export async function fetchDetectionClasses(): Promise<string[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/classes`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch classes');
    const data = await res.json();
    return data.classes || [];
  } catch {
    return [
      'bottle', 'cup', 'apple', 'banana', 'orange', 'sandwich', 'book',
      'cell phone', 'bowl', 'scissors', 'laptop', 'backpack'
    ];
  }
}
