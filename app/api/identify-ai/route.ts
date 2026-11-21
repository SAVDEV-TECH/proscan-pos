import { NextRequest, NextResponse } from 'next/server';
import { listCatalogProducts } from '@/lib/serverCatalog';
import { Product } from '@/lib/products';

export const dynamic = 'force-dynamic';

function tokenize(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !['the', 'and', 'for', 'with', 'pack', 'satchet', 'sachet'].includes(w));
}

function fuzzyMatchCatalog(query: string, items: Product[]): Product | undefined {
  const q = query.toLowerCase().trim();
  if (!q) return undefined;

  // 1. Exact or direct substring match
  const direct = items.find(
    (p) => p.name.toLowerCase() === q || p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase())
  );
  if (direct) return direct;

  // 2. Token overlap scoring (handles "Kellogg's Coco Pops" <-> "Coco Pop Satchet", "Viva Detergent" <-> "Viva Detergent 170g")
  const qTokens = tokenize(q);
  if (qTokens.length === 0) return undefined;

  let bestProd: Product | undefined;
  let bestScore = 0;

  for (const prod of items) {
    const pTokens = tokenize(prod.name);
    if (pTokens.length === 0) continue;

    let hits = 0;
    for (const qt of qTokens) {
      if (pTokens.some((pt) => pt === qt || pt.startsWith(qt) || qt.startsWith(pt))) {
        hits += 1;
      }
    }
    const score = hits / Math.max(1, Math.min(qTokens.length, pTokens.length));
    if (hits >= 1 && score > bestScore) {
      bestScore = score;
      bestProd = prod;
    }
  }

  return bestScore >= 0.5 ? bestProd : undefined;
}

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
    // Compact id:name list so ALL 100+ Mogshops products fit easily in context
    const catalogLines = items
      .slice(0, 400)
      .map((p) => `${p.id} | ${p.name} ($${p.price})`)
      .join('\n');

    const b64Clean = image.includes(',') ? image.split(',')[1] : image;
    const prompt =
      'You are an ultra-accurate supermarket POS vision scanner for a Nigerian retail store (Mogshop).\n' +
      'RULES:\n' +
      '1. COMPLETELY IGNORE any human face, person, hand, fingers, shirt, or room background. Focus ONLY on the retail/grocery product being held or shown to the camera (sachet, pack, box, bottle, tin, cereal, detergent, snack, drink).\n' +
      '2. If there is NO retail product visible in the image (only a person or empty room), return ONLY: {"found": false, "matched_id": null}.\n' +
      '3. If a retail product IS visible, read the brand name, flavor, and size on the packaging and match it to the closest item in the store catalog below—even if the catalog has minor spelling variations (e.g., "Coco Pops" matches "Coco Pop Satchet", "Viva" matches "Viva Detergent 170g", "Exotic" matches "1 litre exotic").\n' +
      '4. Also return the product\'s tight bounding box in normalized [ymin, xmin, ymax, xmax] coordinates (0 to 1000) covering ONLY the product (excluding the person/hand).\n\n' +
      `STORE CATALOG (ID | Name | Price):\n${catalogLines}\n\n` +
      'Return ONLY valid JSON:\n' +
      '{"found": true, "matched_id": "exact_id_from_catalog_or_null", "detected_name": "brand and product name read on package", "confidence": 0.96, "box_2d": [ymin, xmin, ymax, xmax]}';

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
      matched = fuzzyMatchCatalog(String(parsed.detected_name), items);
    }

    const box2d: number[] | undefined =
      Array.isArray(parsed.box_2d) && parsed.box_2d.length === 4
        ? parsed.box_2d.map((n: unknown) => Number(n))
        : undefined;

    if (matched) {
      return NextResponse.json({
        success: true,
        detections: [
          {
            class_name: matched.name,
            confidence: Number(parsed.confidence || 0.96),
            product_id: matched.id,
            product_name: matched.name,
            product_price: matched.price,
            match_source: 'gemini_ai',
            bbox: box2d,
          },
        ],
        message: `Matched ${matched.name}`,
        product_not_found: false,
        match_tier: 'Tier 3: AI Catalog Match',
        primary_product_id: matched.id,
        primary_product: matched,
        box_2d: box2d,
      });
    }

    return NextResponse.json({
      success: true,
      detections: [],
      message: parsed.detected_name ? `Unlisted: ${parsed.detected_name}` : 'Product not found',
      product_not_found: true,
      box_2d: box2d,
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
