import { NextRequest, NextResponse } from 'next/server';
import { listCatalogProducts, createCatalogProduct } from '@/lib/serverCatalog';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { items, source } = await listCatalogProducts();
  return NextResponse.json(items, {
    status: 200,
    headers: { 'X-Catalog-Source': source },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || body.price === undefined) {
      return NextResponse.json({ detail: 'Name and price are required' }, { status: 400 });
    }

    const { product, source } = await createCatalogProduct(body);
    return NextResponse.json(product, {
      status: 201,
      headers: { 'X-Catalog-Source': source },
    });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to create product' },
      { status: 400 }
    );
  }
}
