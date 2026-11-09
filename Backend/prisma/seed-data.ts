/**
 * Demo data. The first three SKUs and the first raw message are the client's sample, unchanged.
 * Every other SKU, brand, shop, name and phone number is invented. Messaging is mocked,
 * so nothing is ever sent to these numbers.
 */

export interface SeedScheme {
  kind: 'FREE_GOODS' | 'SLAB_DISCOUNT';
  label: string;
  labelHi: string;
  buyCases?: number;
  freeCases?: number;
  slabs?: { minCases: number; discountPercent: number }[];
}

export interface SeedSku {
  code: string;
  name: string;
  nameHi: string;
  brand: string;
  family: string;
  sizeGrams: number;
  unitsPerCase: number;
  /** Per piece, excluding GST. */
  dealerPrice: number;
  gstPercent: number;
  stockCases: number;
  keywords: string[];
  packKind: string;
  scheme?: SeedScheme;
}

export const BRANDS = ['Aarohi', 'Meher', 'Kanti', 'Vasant'];

const BISCUIT_WORDS = ['biscuit', 'biskut', 'biskit', 'bisket'];
const TEA_WORDS = ['chai', 'tea', 'patti', 'chaipatti', 'leaf'];
const DETERGENT_WORDS = ['detergent', 'surf', 'sarf', 'kapda', 'kapde', 'washing'];

export const SKUS: SeedSku[] = [
  {
    code: 'SKU-BS-075',
    name: 'Glucose biscuit 75 g, case of 96',
    nameHi: 'ग्लूकोज़ बिस्कुट 75 ग्राम',
    brand: 'Aarohi',
    family: 'glucose-biscuit',
    sizeGrams: 75,
    unitsPerCase: 96,
    dealerPrice: 8.1,
    gstPercent: 5,
    stockCases: 340,
    keywords: [...BISCUIT_WORDS, 'glucose', 'gluco'],
    packKind: 'biscuit',
    scheme: {
      kind: 'FREE_GOODS',
      label: 'Buy 10 cases get 1 free',
      labelHi: '10 पेटी पर 1 पेटी फ्री',
      buyCases: 10,
      freeCases: 1,
    },
  },
  {
    code: 'SKU-DT-1KG',
    name: 'Detergent powder 1 kg, case of 20',
    nameHi: 'डिटर्जेंट पाउडर 1 किलो',
    brand: 'Kanti',
    family: 'detergent-powder',
    sizeGrams: 1000,
    unitsPerCase: 20,
    dealerPrice: 101.5,
    gstPercent: 18,
    stockCases: 85,
    keywords: [...DETERGENT_WORDS, 'powder', 'pawdar'],
    packKind: 'pouch',
    scheme: {
      kind: 'SLAB_DISCOUNT',
      label: '3% off 5 or more cases',
      labelHi: '5 या ज़्यादा पेटी पर 3% छूट',
      slabs: [{ minCases: 5, discountPercent: 3 }],
    },
  },
  {
    code: 'SKU-TE-250',
    name: 'Tea leaf 250 g, case of 40',
    nameHi: 'चाय पत्ती 250 ग्राम',
    brand: 'Meher',
    family: 'tea-leaf',
    sizeGrams: 250,
    unitsPerCase: 40,
    dealerPrice: 118,
    gstPercent: 5,
    stockCases: 0,
    keywords: TEA_WORDS,
    packKind: 'box',
  },
  {
    code: 'SKU-BS-200',
    name: 'Glucose biscuit 200 g, case of 48',
    nameHi: 'ग्लूकोज़ बिस्कुट 200 ग्राम',
    brand: 'Aarohi',
    family: 'glucose-biscuit',
    sizeGrams: 200,
    unitsPerCase: 48,
    dealerPrice: 20.5,
    gstPercent: 5,
    stockCases: 120,
    keywords: [...BISCUIT_WORDS, 'glucose', 'gluco'],
    packKind: 'biscuit',
  },
  {
    code: 'SKU-CB-075',
    name: 'Cream biscuit 75 g, case of 96',
    nameHi: 'क्रीम बिस्कुट 75 ग्राम',
    brand: 'Aarohi',
    family: 'cream-biscuit',
    sizeGrams: 75,
    unitsPerCase: 96,
    dealerPrice: 13.4,
    gstPercent: 5,
    stockCases: 210,
    keywords: [...BISCUIT_WORDS, 'cream', 'creem'],
    packKind: 'biscuit',
    scheme: {
      kind: 'SLAB_DISCOUNT',
      label: '2% off 5 cases, 4% off 10',
      labelHi: '5 पेटी पर 2%, 10 पर 4% छूट',
      slabs: [
        { minCases: 5, discountPercent: 2 },
        { minCases: 10, discountPercent: 4 },
      ],
    },
  },
  {
    code: 'SKU-RK-200',
    name: 'Rusk toast 200 g, case of 36',
    nameHi: 'रस्क टोस्ट 200 ग्राम',
    brand: 'Aarohi',
    family: 'rusk',
    sizeGrams: 200,
    unitsPerCase: 36,
    dealerPrice: 26,
    gstPercent: 5,
    stockCases: 64,
    keywords: ['rusk', 'rask', 'toast', 'tost'],
    packKind: 'pillow',
  },
  {
    code: 'SKU-TE-100',
    name: 'Tea leaf 100 g, case of 80',
    nameHi: 'चाय पत्ती 100 ग्राम',
    brand: 'Meher',
    family: 'tea-leaf',
    sizeGrams: 100,
    unitsPerCase: 80,
    dealerPrice: 49,
    gstPercent: 5,
    stockCases: 150,
    keywords: TEA_WORDS,
    packKind: 'box',
  },
  {
    code: 'SKU-TE-500',
    name: 'Tea leaf 500 g, case of 24',
    nameHi: 'चाय पत्ती 500 ग्राम',
    brand: 'Meher',
    family: 'tea-leaf',
    sizeGrams: 500,
    unitsPerCase: 24,
    dealerPrice: 226,
    gstPercent: 5,
    stockCases: 38,
    keywords: TEA_WORDS,
    packKind: 'box',
    scheme: {
      kind: 'SLAB_DISCOUNT',
      label: '2% off 3 cases, 4% off 6',
      labelHi: '3 पेटी पर 2%, 6 पर 4% छूट',
      slabs: [
        { minCases: 3, discountPercent: 2 },
        { minCases: 6, discountPercent: 4 },
      ],
    },
  },
  {
    code: 'SKU-NM-040',
    name: 'Namkeen mix 40 g, case of 120',
    nameHi: 'नमकीन मिक्स 40 ग्राम',
    brand: 'Aarohi',
    family: 'namkeen-mix',
    sizeGrams: 40,
    unitsPerCase: 120,
    dealerPrice: 8.5,
    gstPercent: 5,
    stockCases: 300,
    keywords: ['namkeen', 'mixture', 'mix', 'bhujia'],
    packKind: 'pillow',
  },
  {
    code: 'SKU-NM-200',
    name: 'Namkeen mix 200 g, case of 30',
    nameHi: 'नमकीन मिक्स 200 ग्राम',
    brand: 'Aarohi',
    family: 'namkeen-mix',
    sizeGrams: 200,
    unitsPerCase: 30,
    dealerPrice: 38,
    gstPercent: 5,
    stockCases: 75,
    keywords: ['namkeen', 'mixture', 'mix', 'bhujia'],
    packKind: 'pillow',
  },
  {
    code: 'SKU-ND-070',
    name: 'Instant noodles 70 g, case of 96',
    nameHi: 'इंस्टेंट नूडल्स 70 ग्राम',
    brand: 'Aarohi',
    family: 'noodles',
    sizeGrams: 70,
    unitsPerCase: 96,
    dealerPrice: 12.6,
    gstPercent: 5,
    stockCases: 140,
    keywords: ['noodles', 'nudals', 'nudels', 'maggi'],
    packKind: 'pillow',
  },
  {
    code: 'SKU-DT-500',
    name: 'Detergent powder 500 g, case of 40',
    nameHi: 'डिटर्जेंट पाउडर 500 ग्राम',
    brand: 'Kanti',
    family: 'detergent-powder',
    sizeGrams: 500,
    unitsPerCase: 40,
    dealerPrice: 53,
    gstPercent: 18,
    stockCases: 8,
    keywords: [...DETERGENT_WORDS, 'powder', 'pawdar'],
    packKind: 'pouch',
  },
  {
    code: 'SKU-DB-150',
    name: 'Detergent bar 150 g, case of 72',
    nameHi: 'डिटर्जेंट बार 150 ग्राम',
    brand: 'Kanti',
    family: 'detergent-bar',
    sizeGrams: 150,
    unitsPerCase: 72,
    dealerPrice: 10.2,
    gstPercent: 18,
    stockCases: 260,
    keywords: [...DETERGENT_WORDS, 'bar', 'sabun', 'tikia', 'tikiya'],
    packKind: 'bar',
  },
  {
    code: 'SKU-SP-100',
    name: 'Bathing soap 100 g, case of 72',
    nameHi: 'नहाने का साबुन 100 ग्राम',
    brand: 'Vasant',
    family: 'bath-soap',
    sizeGrams: 100,
    unitsPerCase: 72,
    dealerPrice: 27.5,
    gstPercent: 5,
    stockCases: 180,
    keywords: ['soap', 'sabun', 'bathing', 'nahane'],
    packKind: 'bar',
  },
  {
    code: 'SKU-DW-500',
    name: 'Dishwash liquid 500 ml, case of 24',
    nameHi: 'बर्तन धोने का लिक्विड 500 मिली',
    brand: 'Vasant',
    family: 'dishwash-liquid',
    sizeGrams: 500,
    unitsPerCase: 24,
    dealerPrice: 79,
    gstPercent: 18,
    stockCases: 96,
    keywords: ['dishwash', 'bartan', 'liquid', 'gel', 'jel'],
    packKind: 'bottle',
    scheme: {
      kind: 'FREE_GOODS',
      label: 'Buy 12 cases get 1 free',
      labelHi: '12 पेटी पर 1 पेटी फ्री',
      buyCases: 12,
      freeCases: 1,
    },
  },
  {
    code: 'SKU-FC-1LT',
    name: 'Floor cleaner 1 litre, case of 12',
    nameHi: 'फ़्लोर क्लीनर 1 लीटर',
    brand: 'Vasant',
    family: 'floor-cleaner',
    sizeGrams: 1000,
    unitsPerCase: 12,
    dealerPrice: 112,
    gstPercent: 18,
    stockCases: 44,
    keywords: ['floor', 'cleaner', 'phenyl', 'phenol', 'pocha'],
    packKind: 'bottle',
  },
];

export interface SeedRetailer {
  code: string;
  shopName: string;
  ownerName: string;
  phone: string;
  area: string;
  beat: string;
  creditLimit: number;
  outstanding: number;
  /** SKU code and the cases this shop tends to order at a time. */
  habits: [string, number][];
  /** Days between orders in the generated history. */
  cadence: number;
  /** Days since the last order, or null for a shop that has never ordered. */
  lastOrderDaysAgo: number | null;
  specialPrices?: Record<string, number>;
}

const ROUTE_1 = 'Route 1 · Napier Town';
const ROUTE_2 = 'Route 2 · Adhartal';
const ROUTE_3 = 'Route 3 · Garha';

export const DESK_USER = { phone: '9000000099', name: 'Priya' };

export const RETAILERS: SeedRetailer[] = [
  {
    code: 'R-1001',
    shopName: 'Gupta Kirana Store',
    ownerName: 'Ramesh Gupta',
    phone: '9000000001',
    area: 'Napier Town',
    beat: ROUTE_1,
    creditLimit: 200_000,
    outstanding: 64_000,
    habits: [
      ['SKU-BS-075', 3],
      ['SKU-DT-1KG', 1],
      ['SKU-TE-250', 1],
      ['SKU-NM-040', 2],
    ],
    cadence: 4,
    lastOrderDaysAgo: 2,
  },
  {
    code: 'R-1002',
    shopName: 'Sharma General Store',
    ownerName: 'Sunita Sharma',
    phone: '9000000002',
    area: 'Wright Town',
    beat: ROUTE_1,
    creditLimit: 60_000,
    outstanding: 56_500,
    habits: [
      ['SKU-BS-075', 2],
      ['SKU-TE-100', 1],
      ['SKU-DB-150', 1],
    ],
    cadence: 5,
    lastOrderDaysAgo: 3,
  },
  {
    code: 'R-1003',
    shopName: 'New Bharat Provision',
    ownerName: 'Imran Qureshi',
    phone: '9000000003',
    area: 'Adhartal',
    beat: ROUTE_2,
    creditLimit: 150_000,
    outstanding: 31_200,
    habits: [
      ['SKU-BS-200', 3],
      ['SKU-TE-500', 1],
      ['SKU-DT-500', 1],
    ],
    cadence: 6,
    lastOrderDaysAgo: 1,
    specialPrices: { 'SKU-DT-1KG': 99, 'SKU-BS-200': 19.9 },
  },
  {
    code: 'R-1004',
    shopName: 'Verma & Sons',
    ownerName: 'Ajay Verma',
    phone: '9000000004',
    area: 'Ranjhi',
    beat: ROUTE_2,
    creditLimit: 120_000,
    outstanding: 18_400,
    habits: [
      ['SKU-DB-150', 2],
      ['SKU-SP-100', 1],
      ['SKU-NM-200', 2],
    ],
    cadence: 7,
    lastOrderDaysAgo: 4,
  },
  {
    code: 'R-1005',
    shopName: 'Jain Super Mart',
    ownerName: 'Neha Jain',
    phone: '9000000005',
    area: 'Vijay Nagar',
    beat: ROUTE_3,
    creditLimit: 300_000,
    outstanding: 92_750,
    habits: [
      ['SKU-CB-075', 3],
      ['SKU-DW-500', 2],
      ['SKU-FC-1LT', 1],
      ['SKU-ND-070', 2],
    ],
    cadence: 3,
    lastOrderDaysAgo: 1,
  },
  {
    code: 'R-1006',
    shopName: 'Patel Kirana',
    ownerName: 'Mahesh Patel',
    phone: '9000000006',
    area: 'Garha',
    beat: ROUTE_3,
    creditLimit: 80_000,
    outstanding: 77_300,
    habits: [
      ['SKU-BS-075', 2],
      ['SKU-NM-040', 1],
    ],
    cadence: 5,
    lastOrderDaysAgo: 6,
  },
  {
    code: 'R-1007',
    shopName: 'Sahu Traders',
    ownerName: 'Rekha Sahu',
    phone: '9000000007',
    area: 'Madan Mahal',
    beat: ROUTE_1,
    creditLimit: 100_000,
    outstanding: 12_600,
    habits: [
      ['SKU-TE-100', 2],
      ['SKU-RK-200', 1],
    ],
    cadence: 6,
    lastOrderDaysAgo: 16,
  },
  {
    code: 'R-1008',
    shopName: 'Tiwari Stores',
    ownerName: 'Deepak Tiwari',
    phone: '9000000008',
    area: 'Gorakhpur',
    beat: ROUTE_3,
    creditLimit: 90_000,
    outstanding: 40_000,
    habits: [
      ['SKU-BS-200', 1],
      ['SKU-SP-100', 2],
    ],
    cadence: 8,
    lastOrderDaysAgo: 23,
  },
  {
    code: 'R-1009',
    shopName: 'Khan General Merchant',
    ownerName: 'Farida Khan',
    phone: '9000000009',
    area: 'Adhartal',
    beat: ROUTE_2,
    creditLimit: 70_000,
    outstanding: 8_900,
    habits: [
      ['SKU-ND-070', 1],
      ['SKU-DT-500', 1],
    ],
    cadence: 9,
    lastOrderDaysAgo: 41,
  },
  {
    code: 'R-1010',
    shopName: 'Shree Ganesh Bhandar',
    ownerName: 'Vinod Yadav',
    phone: '9000000010',
    area: 'Ranjhi',
    beat: ROUTE_2,
    creditLimit: 50_000,
    outstanding: 0,
    habits: [],
    cadence: 0,
    lastOrderDaysAgo: null,
  },
];

/** The client's raw order message, exactly as supplied. */
export const SAMPLE_MESSAGE =
  'bhaiya 5 peti biscuit chhota, 2 peti washing powder 1 kilo, chai patti 250 wala 1 peti';

export const SEED_MESSAGES: { retailerCode: string; text: string }[] = [
  { retailerCode: 'R-1001', text: SAMPLE_MESSAGE },
  { retailerCode: 'R-1002', text: 'biscuit 5, chai 100 wala 2 dabba, surf 500 3 peti' },
  { retailerCode: 'R-1003', text: 'Namaste ji. 10 peti glucose biskit 200 wala aur kali mirch 2 packet bhej do' },
  { retailerCode: 'R-1005', text: '5 पेटी क्रीम बिस्कुट और 2 पेटी नमकीन 200 ग्राम' },
  { retailerCode: 'R-1004', text: 'pila wala 4 peti, 60 peti sabun 100 gram' },
];

/** A shop nickname, as a past desk correction would have taught it. */
export const SEED_ALIAS = { retailerCode: 'R-1004', phrase: 'pila', skuCode: 'SKU-DB-150' };
