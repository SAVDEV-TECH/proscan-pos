export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  barcode: string;
  description?: string;
  category: string;
  yolo_classes?: string;
  has_visual_fingerprint?: boolean;
  reference_image?: string;
  visual_embeddings?: number[][];
}

export function isRealImage(src?: string): boolean {
  if (!src) return false;
  return src.startsWith('data:image') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/');
}

export function getProductPhoto(product?: { image?: string; reference_image?: string } | null): string | null {
  if (!product) return null;
  if (isRealImage(product.reference_image)) return product.reference_image!;
  if (isRealImage(product.image)) return product.image!;
  return null;
}

export const PRODUCTS: Product[] = [
  {
    id: "prod-001",
    name: "Spring Water Bottle",
    price: 1.50,
    image: "beverage",
    barcode: "123456789012",
    category: "Beverages",
    description: "500ml refreshing pure natural spring water",
    yolo_classes: "bottle",
  },
  {
    id: "prod-002",
    name: "Fresh Red Apple",
    price: 0.85,
    image: "produce",
    barcode: "234567890123",
    category: "Produce",
    description: "Crisp and juicy sweet organic red apple",
    yolo_classes: "apple",
  },
  {
    id: "prod-003",
    name: "Organic Banana",
    price: 0.65,
    image: "produce",
    barcode: "345678901234",
    category: "Produce",
    description: "Fresh ripe fair-trade Cavendish banana",
    yolo_classes: "banana",
  },
  {
    id: "prod-004",
    name: "Ceramic Coffee Mug",
    price: 4.99,
    image: "kitchenware",
    barcode: "456789012345",
    category: "Kitchenware",
    description: "Premium 12oz ceramic coffee and tea mug",
    yolo_classes: "cup,wine glass",
  },
  {
    id: "prod-005",
    name: "Fresh Valencia Orange",
    price: 0.75,
    image: "produce",
    barcode: "567890123456",
    category: "Produce",
    description: "Sweet and tangy citrus orange full of Vitamin C",
    yolo_classes: "orange,sports ball",
  },
  {
    id: "prod-006",
    name: "Artisan Deli Sandwich",
    price: 5.50,
    image: "deli",
    barcode: "678901234567",
    category: "Deli & Bakery",
    description: "Freshly prepared club sandwich with cheese and greens",
    yolo_classes: "sandwich,hot dog,pizza,donut,cake",
  },
  {
    id: "prod-007",
    name: "Hardcover Notebook",
    price: 3.50,
    image: "stationery",
    barcode: "789012345678",
    category: "Stationery",
    description: "160-page ruled notebook for notes and journaling",
    yolo_classes: "book",
  },
  {
    id: "prod-008",
    name: "Smartphone Accessory Case",
    price: 9.99,
    image: "electronics",
    barcode: "890123456789",
    category: "Electronics",
    description: "Protective slim shock-resistant phone case",
    yolo_classes: "cell phone,remote,mouse",
  },
  {
    id: "prod-009",
    name: "Hungryman Instant Noodles",
    price: 1.20,
    image: "food",
    barcode: "901234567890",
    category: "Food & Grocery",
    description: "Delicious quick-cooking seasoned ramen noodles",
    yolo_classes: "hungryman_noodles,bowl",
  },
  {
    id: "prod-010",
    name: "Premium Tomato Paste Sachet",
    price: 0.50,
    image: "condiments",
    barcode: "012345678901",
    category: "Condiments",
    description: "Rich concentrated double-strength tomato purée",
    yolo_classes: "tomato_sachet",
  },
  {
    id: "prod-011",
    name: "Cowbell Evaporated Milk",
    price: 2.50,
    image: "dairy",
    barcode: "112233445566",
    category: "Dairy",
    description: "Creamy evaporated milk enriched with vitamins",
    yolo_classes: "cowbell_milk",
  },
];

// Look up by product ID — used by ML backend detection results
export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

// Look up by barcode — used by simulated barcode scans
export function getProductByBarcode(barcode: string): Product | undefined {
  return PRODUCTS.find((p) => p.barcode === barcode);
}

// Return a random product — for demo/testing purposes
export function simulateScan(): Product {
  return PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
}
