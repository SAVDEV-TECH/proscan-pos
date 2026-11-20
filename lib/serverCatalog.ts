import fs from 'fs';
import path from 'path';
import { PRODUCTS, Product, isRealImage } from '@/lib/products';
import { getAdminDb } from '@/lib/firebaseAdmin';

const DB_FILE = path.join(process.cwd(), 'catalog_db.json');
const COLLECTION = 'products';

function normalizeDocToProduct(id: string, data: Record<string, any>): Product {
  const firstImg =
    (typeof data.reference_image === 'string' && isRealImage(data.reference_image) && data.reference_image) ||
    (Array.isArray(data.images) && typeof data.images[0] === 'string' && isRealImage(data.images[0]) && data.images[0]) ||
    (typeof data.imageUrl === 'string' && isRealImage(data.imageUrl) && data.imageUrl) ||
    (typeof data.image === 'string' && data.image) ||
    '';

  let parsedEmbeddings: number[][] | undefined = undefined;
  if (typeof data.visual_embeddings_json === 'string' && data.visual_embeddings_json.trim()) {
    try {
      const arr = JSON.parse(data.visual_embeddings_json);
      if (Array.isArray(arr) && arr.length > 0) {
        parsedEmbeddings = arr;
      }
    } catch {
      // ignore malformed JSON
    }
  } else if (Array.isArray(data.visual_embeddings)) {
    parsedEmbeddings = data.visual_embeddings;
  }

  return {
    id,
    name: String(data.name || data.title || 'Unnamed Product').trim(),
    price: Number(data.price ?? data.estimatedPrice ?? 0) || 0,
    image: firstImg,
    reference_image: isRealImage(firstImg) ? firstImg : '',
    barcode: String(data.barcode || id),
    category: String(data.category || 'General'),
    description: String(data.description || ''),
    yolo_classes: String(data.yolo_classes || '').toLowerCase().trim(),
    has_visual_fingerprint: Boolean(data.has_visual_fingerprint || (parsedEmbeddings && parsedEmbeddings.length > 0)),
    visual_embeddings: parsedEmbeddings,
  };
}

function parseFirestoreRestValue(field: Record<string, any> | undefined): any {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return Number(field.doubleValue);
  if ('booleanValue' in field) return Boolean(field.booleanValue);
  if ('arrayValue' in field) {
    const vals = field.arrayValue?.values || [];
    return vals.map((v: Record<string, any>) => parseFirestoreRestValue(v));
  }
  return undefined;
}

async function fetchFirestoreViaPublicRest(): Promise<Product[] | null> {
  const projectId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').trim().replace(/^"|"$/g, '');
  if (!projectId) return null;

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${COLLECTION}?pageSize=100`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const docs = Array.isArray(json.documents) ? json.documents : [];
    return docs.map((doc: any) => {
      const id = String(doc.name || '').split('/').pop() || `fs-${Math.random().toString(36).slice(2, 8)}`;
      const fields = doc.fields || {};
      const flat: Record<string, any> = {};
      for (const [k, v] of Object.entries(fields)) {
        flat[k] = parseFirestoreRestValue(v as Record<string, any>);
      }
      return normalizeDocToProduct(id, flat);
    });
  } catch {
    return null;
  }
}

function readLocalJsonCatalog(): Product[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[Local Catalog] Read fallback:', err);
  }
  return [...PRODUCTS];
}

function writeLocalJsonCatalog(items: Product[]): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch {
    // Vercel serverless filesystem is read-only outside /tmp; safely ignore
  }
}

export async function listCatalogProducts(): Promise<{ items: Product[]; source: 'firestore' | 'firestore-rest' | 'local' }> {
  // 1. Try Firebase Admin SDK (full read/write)
  const db = getAdminDb();
  if (db) {
    try {
      const snapshot = await db.collection(COLLECTION).get();
      const firestoreItems: Product[] = snapshot.docs.map((doc) =>
        normalizeDocToProduct(doc.id, doc.data())
      );
      const existingIds = new Set(firestoreItems.map((p) => p.id));
      const merged = [
        ...firestoreItems,
        ...PRODUCTS.filter((p) => !existingIds.has(p.id)),
      ];
      return { items: merged, source: 'firestore' };
    } catch (err) {
      console.warn('[Firestore Admin] Read error, trying public REST fallback:', err);
    }
  }

  // 2. Try Firestore Public REST Read (works with NEXT_PUBLIC_FIREBASE_PROJECT_ID alone)
  const restItems = await fetchFirestoreViaPublicRest();
  if (restItems && restItems.length > 0) {
    const existingIds = new Set(restItems.map((p) => p.id));
    const localItems = readLocalJsonCatalog();
    const merged = [
      ...restItems,
      ...localItems.filter((p) => !existingIds.has(p.id)),
    ];
    return { items: merged, source: 'firestore-rest' };
  }

  return { items: readLocalJsonCatalog(), source: 'local' };
}

export async function createCatalogProduct(body: Record<string, any>): Promise<{ product: Product; source: 'firestore' | 'local' }> {
  const id = body.id ? String(body.id) : `prod-${Date.now().toString(36)}`;
  const photo = isRealImage(body.reference_image)
    ? String(body.reference_image)
    : isRealImage(body.image)
    ? String(body.image)
    : '';

  const product: Product = {
    id,
    name: String(body.name).trim(),
    price: Number(body.price),
    image: photo || body.image || '',
    reference_image: photo,
    barcode: body.barcode?.trim() || String(Math.floor(100000000000 + Math.random() * 900000000000)),
    category: String(body.category || 'General'),
    description: String(body.description || 'Trained via Proscan Camera'),
    yolo_classes: String(body.yolo_classes || '').toLowerCase().trim(),
    has_visual_fingerprint: Boolean(body.has_visual_fingerprint || body.visual_embeddings?.length),
    visual_embeddings: Array.isArray(body.visual_embeddings) ? body.visual_embeddings : undefined,
  };

  const db = getAdminDb();
  if (db) {
    try {
      const firestorePayload: Record<string, any> = {
        name: product.name,
        price: product.price,
        image: product.image,
        reference_image: product.reference_image || '',
        images: product.reference_image ? [product.reference_image] : [],
        barcode: product.barcode,
        category: product.category,
        description: product.description,
        yolo_classes: product.yolo_classes || '',
        has_visual_fingerprint: Boolean(product.has_visual_fingerprint),
        source: 'proscan-pos',
        inStock: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      if (product.visual_embeddings && product.visual_embeddings.length > 0) {
        firestorePayload.visual_embeddings_json = JSON.stringify(product.visual_embeddings);
      }

      await db.collection(COLLECTION).doc(id).set(firestorePayload, { merge: true });
      return { product, source: 'firestore' };
    } catch (err) {
      console.error('[Firestore] Create error:', err);
    }
  }

  const localItems = readLocalJsonCatalog();
  writeLocalJsonCatalog([product, ...localItems.filter((p) => p.id !== product.id)]);
  return { product, source: 'local' };
}

export async function updateCatalogProduct(id: string, updates: Record<string, any>): Promise<Product | null> {
  const db = getAdminDb();
  if (db) {
    try {
      const docRef = db.collection(COLLECTION).doc(id);
      const snap = await docRef.get();
      const existingBase = snap.exists
        ? normalizeDocToProduct(id, snap.data() || {})
        : PRODUCTS.find((p) => p.id === id);

      if (!existingBase) return null;

      const photo = isRealImage(updates.reference_image)
        ? String(updates.reference_image)
        : isRealImage(updates.image)
        ? String(updates.image)
        : existingBase.reference_image || '';

      const merged: Product = {
        ...existingBase,
        ...updates,
        id,
        price: updates.price !== undefined ? Number(updates.price) : existingBase.price,
        image: photo || updates.image || existingBase.image,
        reference_image: photo,
        has_visual_fingerprint: Boolean(
          updates.has_visual_fingerprint ??
            existingBase.has_visual_fingerprint ??
            updates.visual_embeddings?.length
        ),
      };

      const firestoreUpdate: Record<string, any> = {
        name: merged.name,
        price: merged.price,
        image: merged.image,
        reference_image: merged.reference_image || '',
        barcode: merged.barcode,
        category: merged.category,
        description: merged.description || '',
        yolo_classes: merged.yolo_classes || '',
        has_visual_fingerprint: Boolean(merged.has_visual_fingerprint),
        updatedAt: new Date().toISOString(),
      };
      if (merged.reference_image) {
        firestoreUpdate.images = [merged.reference_image];
      }
      if (Array.isArray(updates.visual_embeddings) && updates.visual_embeddings.length > 0) {
        firestoreUpdate.visual_embeddings_json = JSON.stringify(updates.visual_embeddings);
      }

      await docRef.set(firestoreUpdate, { merge: true });
      return merged;
    } catch (err) {
      console.error('[Firestore] Update error:', err);
    }
  }

  const items = readLocalJsonCatalog();
  const idx = items.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updatedProduct: Product = {
    ...items[idx],
    ...updates,
    price: updates.price !== undefined ? Number(updates.price) : items[idx].price,
  };
  items[idx] = updatedProduct;
  writeLocalJsonCatalog(items);
  return updatedProduct;
}

export async function deleteCatalogProduct(id: string): Promise<boolean> {
  const db = getAdminDb();
  if (db) {
    try {
      await db.collection(COLLECTION).doc(id).delete();
      return true;
    } catch (err) {
      console.error('[Firestore] Delete error:', err);
    }
  }
  const items = readLocalJsonCatalog();
  writeLocalJsonCatalog(items.filter((p) => p.id !== id));
  return true;
}
