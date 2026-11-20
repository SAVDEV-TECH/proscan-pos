import { NextRequest, NextResponse } from 'next/server';
import { listCatalogProducts } from '@/lib/serverCatalog';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const { image } = await req.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ success: false, message: 'No image provided' }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({
        success: true,
        detections: [],
        message: 'Product not found',
        product_not_found: true,
      });
    }

    const { items } = await listCatalogProducts();
    const catalogSummary = items.slice(0, 80).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      category: p.category,
    }));

    const b64Clean = image.includes(',') ? image.split(',')[1] : image;
    const prompt =
      'You are a supermarket POS product scanner. Silently ignore any human face, hand, or body in the frame and focus ONLY on the retail product held in front of the camera. ' +
      'If there is NO clear retail product in the image, return ONLY: {"matched_id": null, "found": false}. ' +
      `Otherwise, match the product against this store catalog: ${JSON.stringify(catalogSummary)}. ` +
      'Return ONLY valid JSON: {"matched_id": "exact_id_from_catalog_or_null", "found": true, "detected_name": "name on package", "confidence": 0.95}.';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: b64Clean } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    });

    if (!resp.ok) {
      return NextResponse.json({
        success: true,
        detections: [],
        message: 'Product not found',
        product_not_found: true,
      });
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(text);

    if (!parsed.found) {
      return NextResponse.json({
        success: true,
        detections: [],
        message: 'Product not found',
        product_not_found: true,
      });
    }

    let matched = parsed.matched_id ? items.find((p) => p.id === parsed.matched_id) : undefined;
    if (!matched && parsed.detected_name) {
      const q = String(parsed.detected_name).toLowerCase().trim();
      matched = items.find(
        (p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase())
      );
    }

    if (matched) {
      return NextResponse.json({
        success: true,
        detections: [
          {
            class_name: matched.name,
            confidence: Number(parsed.confidence || 0.95),
            product_id: matched.id,
            product_name: matched.name,
            product_price: matched.price,
            match_source: 'gemini_ai',
          },
        ],
        message: `Matched ${matched.name}`,
        product_not_found: false,
        match_tier: 'Tier 3: Gemini Cloud Match',
        primary_product_id: matched.id,
        primary_product: matched,
      });
    }

    return NextResponse.json({
      success: true,
      detections: [],
      message: 'Product not found',
      product_not_found: true,
    });
  } catch (err) {
    console.error('[Identify-AI Error]', err);
    return NextResponse.json({
      success: true,
      detections: [],
      message: 'Product not found',
      product_not_found: true,
    });
  }
}
