import { NextRequest, NextResponse } from 'next/server';
import { Product } from '@/lib/products';
import { readServerCatalog, writeServerCatalog } from '@/lib/serverCatalog';

export async function GET() {
  const items = readServerCatalog();
  return NextResponse.json(items, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || body.price === undefined) {
      return NextResponse.json({ detail: 'Name and price are required' }, { status: 400 });
    }

    const items = readServerCatalog();
    const newProduct: Product = {
      id: body.id || `prod-${Date.now().toString(36)}`,
      name: String(body.name).trim(),
      price: Number(body.price),
      image: body.image || '📦',
      barcode: body.barcode?.trim() || String(Math.floor(100000000000 + Math.random() * 900000000000)),
      category: body.category || 'General',
      description: body.description || 'Trained via Proscan Camera',
      yolo_classes: (body.yolo_classes || '').toLowerCase().trim(),
      has_visual_fingerprint: Boolean(body.has_visual_fingerprint || body.visual_embeddings?.length),
      reference_image: body.reference_image || '',
      visual_embeddings: body.visual_embeddings || undefined,
    };

    const updated = [newProduct, ...items.filter((p) => p.id !== newProduct.id)];
    writeServerCatalog(updated);

    return NextResponse.json(newProduct, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to create product' },
      { status: 400 }
    );
  }
}
