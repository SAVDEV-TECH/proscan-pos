import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = body.id || `POS-${Date.now().toString(36).toUpperCase()}`;
    const db = getAdminDb();

    if (db) {
      await db.collection('orders').doc(orderId).set({
        id: orderId,
        isGuest: true,
        source: 'proscan-pos',
        paymentMethod: body.method || 'POS Card',
        total: Number(body.total || 0),
        items: Array.isArray(body.items) ? body.items : [],
        status: 'paid',
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true, id: orderId, synced: Boolean(db) }, { status: 201 });
  } catch (err) {
    console.warn('[POS Order Save Warning]', err);
    return NextResponse.json({ success: true, synced: false }, { status: 200 });
  }
}
