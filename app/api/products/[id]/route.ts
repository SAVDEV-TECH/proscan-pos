import { NextRequest, NextResponse } from 'next/server';
import { updateCatalogProduct, deleteCatalogProduct } from '@/lib/serverCatalog';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const updates = await req.json();
    const updatedProduct = await updateCatalogProduct(params.id, updates);

    if (!updatedProduct) {
      return NextResponse.json({ detail: 'Product not found' }, { status: 404 });
    }

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
  await deleteCatalogProduct(params.id);
  return NextResponse.json({ success: true }, { status: 200 });
}
