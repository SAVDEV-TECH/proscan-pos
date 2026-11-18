import { NextRequest, NextResponse } from 'next/server';
import { readServerCatalog, writeServerCatalog } from '@/lib/serverCatalog';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const updates = await req.json();
    const items = readServerCatalog();
    const idx = items.findIndex((p) => p.id === id);

    if (idx === -1) {
      return NextResponse.json({ detail: 'Product not found' }, { status: 404 });
    }

    const updatedProduct = {
      ...items[idx],
      ...updates,
      price: updates.price !== undefined ? Number(updates.price) : items[idx].price,
      has_visual_fingerprint: Boolean(
        updates.has_visual_fingerprint ??
          items[idx].has_visual_fingerprint ??
          updates.visual_embeddings?.length
      ),
    };

    items[idx] = updatedProduct;
    writeServerCatalog(items);

    return NextResponse.json(updatedProduct, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to update product' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  const items = readServerCatalog();
  const filtered = items.filter((p) => p.id !== id);
  writeServerCatalog(filtered);
  return NextResponse.json({ success: true }, { status: 200 });
}
