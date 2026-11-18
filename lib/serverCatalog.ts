import fs from 'fs';
import path from 'path';
import { PRODUCTS, Product } from '@/lib/products';

const DB_FILE = path.join(process.cwd(), 'catalog_db.json');

export function readServerCatalog(): Product[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[Server Catalog] Read fallback:', err);
  }
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(PRODUCTS, null, 2), 'utf-8');
  } catch {
    // ignore read-only fs errors
  }
  return [...PRODUCTS];
}

export function writeServerCatalog(items: Product[]): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Server Catalog] Write warning:', err);
  }
}
