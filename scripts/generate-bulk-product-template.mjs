#!/usr/bin/env node
/**
 * Seller-friendly bulk listing Excel template (plain English).
 * Output: public/templates/BZEAD-Bulk-Product-Listing-Template.xlsx
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

const ABOUT_POINT_COUNT = 10;
const SPEC_PAIR_COUNT = 6;

async function loadLocalEnv() {
  if (process.env.VITE_SUPABASE_URL && getSupabasePublicKey()) return;
  try {
    const raw = await readFile(path.resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (k && (process.env[k] == null || process.env[k] === '')) process.env[k] = v;
    }
  } catch {
    // optional
  }
}

function getSupabasePublicKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY;
}

async function fetchCategories() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = getSupabasePublicKey();
  if (!url || !key) return [];

  const res = await fetch(
    `${url}/rest/v1/categories?select=id,name,parent_id,level&order=level.asc,name.asc&limit=5000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) return [];
  return res.json();
}

function buildCategoryPaths(rows) {
  const l1 = rows.filter((r) => r.level === 1);
  const paths = [];

  for (const c1 of l1) {
    const l2s = rows.filter((r) => r.parent_id === c1.id && r.level === 2);
    if (!l2s.length) {
      paths.push({ l1: c1.name, l2: '', l3: '' });
      continue;
    }
    for (const c2 of l2s) {
      const l3s = rows.filter((r) => r.parent_id === c2.id && r.level === 3);
      if (!l3s.length) {
        paths.push({ l1: c1.name, l2: c2.name, l3: '' });
        continue;
      }
      for (const c3 of l3s) {
        paths.push({ l1: c1.name, l2: c2.name, l3: c3.name });
      }
    }
  }
  return paths.sort((a, b) => `${a.l1}|${a.l2}|${a.l3}`.localeCompare(`${b.l1}|${b.l2}|${b.l3}`));
}

function buildProductHeaders() {
  const headers = [
    'Product Name *',
    'Main Category *',
    'Sub-Category',
    'Product Type',
    'Brand Name *',
    'Short Description * (max 350 letters)',
  ];

  for (let i = 1; i <= ABOUT_POINT_COUNT; i += 1) {
    headers.push(i === 1
      ? `About Product — Point ${i} * (one sentence)`
      : `About Product — Point ${i} (optional)`);
  }

  headers.push('Product Highlight * (max 400 letters)');

  for (let i = 1; i <= SPEC_PAIR_COUNT; i += 1) {
    headers.push(i === 1 ? `Feature Name ${i} *` : `Feature Name ${i}`);
    headers.push(i === 1 ? `Feature Detail ${i} *` : `Feature Detail ${i}`);
  }

  headers.push(
    'Default Variant MRP (₹) * — for auto-generated variant row',
    'Default Variant Selling Price (₹) * — what buyer pays on that row',
    'Default Variant Stock * — units on that variant row',
    'Manufacturer Name * (who made the product)',
    'Manufacturer Country *',
    'Ingredients (one item per line — optional, max 50)',
    'How to Use / Directions (optional, max 1000 letters)',
    'Important Note for Buyer (optional, max 1000 letters)',
    'Cash on Delivery? (Yes / No) *',
    'Ship to Other Countries? (Yes / No) *',
    'Your Product Code / SKU (leave blank — we assign automatically)',
  );

  return headers;
}

function buildSampleRow() {
  return [
    'Silicone Spatula Set 33 Pieces',
    'Home & Kitchen',
    'Kitchen Tools',
    'Spatulas & Ladles',
    'HomeStyle',
    'Premium silicone spatulas for everyday cooking.',
    'Complete set for non-stick pans.',
    'Heat-resistant silicone up to 230°C.',
    'Easy to clean and store.',
    'Safe for daily kitchen use.',
    'Ideal gift for home cooks.',
    'Flexible heads for scraping bowls and pans.',
    'Includes spatula, spoonula, and turner styles.',
    'Non-scratch — safe on coated cookware.',
    'Compact storage stand included.',
    'Designed for everyday Indian home kitchens.',
    'A complete silicone spatula set for everyday non-stick cooking.',
    'Material',
    'Food-grade silicone',
    'Pieces in pack',
    '33',
    'Heat resistant up to 230°C',
    'Yes',
    'Dishwasher safe',
    'BPA free',
    'Non-stick safe',
    '499',
    '399',
    '50',
    'ABC Manufacturing Pvt Ltd',
    'India',
    'Silicone\nWooden handle\nStorage stand',
    'Hand wash recommended. Do not use on open flame.',
    'Keep away from sharp knives to avoid surface cuts.',
    'Yes',
    'No',
    '',
  ];
}

const INSTRUCTIONS = [
  ['HOW TO USE THIS FILE — READ FIRST'],
  [''],
  ['About Product (5–10 bullet lines per product)'],
  ['• You have 10 columns: "About Product — Point 1" through "Point 10".'],
  ['• ONE column = ONE bullet line (same as pressing Enter between lines in the app).'],
  ['• Point 1 is required. Fill as many of Points 2–10 as you need (most products use 5–10).'],
  ['• On upload, all filled points are joined into products.description — the buyer page shows each as a bullet.'],
  ['• No maximum in the app (only minimum 30 characters total). Need more than 10? Add extra lines in the app when you complete the draft.'],
  [''],
  ['Specifications (more than 2?)'],
  ['• You have Feature Name 1–6 and Feature Detail 1–6 (12 columns).'],
  ['• At least Feature 1 + Detail 1 are required. Use as many pairs as you need.'],
  [''],
  ['Price & stock — how BZEAD actually works (read carefully)'],
  ['• In the app, price and stock live on a product_variants row — NOT on the basic product form.'],
  ['• Even Free Size + no color: you click "Generate Variant Combinations" → one default variant row is created (auto variant SKU) → THEN you enter MRP, Selling Price, Stock on that row.'],
  ['• Cart and checkout always use variant_id. Every product must have at least one variant row.'],
  ['• These 3 Excel columns = values for that ONE default variant row when bulk upload runs.'],
  ['• Bulk upload will auto-create the default variant (same as Generate Variant Combinations with no size/color picked) and apply these numbers.'],
  ['• If you list manually in the app instead: leave basic step without price — go to Product Details → Generate Variant Combinations → fill the variant row.'],
  ['• Multiple sizes or colors? Do NOT rely on these columns — add each variant and its price/stock in the app.'],
  ['• Default Variant Selling Price must be ≤ Default Variant MRP.'],
  [''],
  ['Ingredients, directions, important note'],
  ['• Columns are on the right side of the sheet before Cash on Delivery.'],
  ['• All optional — fill if relevant for food, cosmetics, supplements, etc.'],
  ['• Ingredients: one item per line in the same cell (press Alt+Enter between lines).'],
  [''],
  ['What you do NOT put in Excel (finish in the BZEAD app)'],
  ['• Product photos (minimum 5 per product).'],
  ['• Sizes, colors, variants (if more than one selling option).'],
  ['• Package weight & box dimensions.'],
  [''],
  ['After upload: My Products → Draft → Complete Listing → photos → variants (if needed) → submit.'],
  [''],
  ['Pick categories only from the "Category List" sheet. Minimum 25 products per upload when enabled.'],
];

function colLetter(n) {
  let s = '';
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

function headerText(cell) {
  return String(cell.value ?? '');
}

function styleHeaderRow(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 40;
}

function styleInstructionTitle(row) {
  row.font = { bold: true, size: 14, color: { argb: 'FF1D4ED8' } };
}

const COLUMN_NOTES = {
  'Default Variant MRP (₹) * — for auto-generated variant row': 'MRP on the auto-created default variant row (same place as Product Details → Variant Rows). Required for bulk upload.',
  'Default Variant Selling Price (₹) * — what buyer pays on that row': 'Selling price on that default variant row. Must be ≤ Default Variant MRP. Cart uses this variant row.',
  'Default Variant Stock * — units on that variant row': 'Stock on the default variant row only. If you add more variants in the app, stock is per variant row.',
  'Ingredients (one item per line — optional, max 50)': 'Optional. One ingredient per line in this cell. Shown on product page if filled.',
  'How to Use / Directions (optional, max 1000 letters)': 'Optional usage steps — how to apply, cook, assemble, etc.',
  'Important Note for Buyer (optional, max 1000 letters)': 'Optional warning or caution shown to buyers.',
};

async function main() {
  await loadLocalEnv();
  const categories = await fetchCategories();
  const paths = buildCategoryPaths(categories);
  const headers = buildProductHeaders();

  const wb = new ExcelJS.Workbook();
  wb.creator = 'BZEAD';
  wb.created = new Date();

  const wsHelp = wb.addWorksheet('Start Here', { views: [{ state: 'frozen', ySplit: 1 }] });
  INSTRUCTIONS.forEach((line, idx) => {
    const row = wsHelp.addRow(line);
    if (idx === 0) styleInstructionTitle(row.getCell(1));
  });
  wsHelp.getColumn(1).width = 98;

  const wsCat = wb.addWorksheet('Category List', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsCat.addRow(['Main Category', 'Sub-Category', 'Product Type']);
  styleHeaderRow(wsCat.getRow(1));
  if (paths.length) {
    paths.forEach((p) => wsCat.addRow([p.l1, p.l2, p.l3]));
  } else {
    wsCat.addRow(['(Could not load categories — run npm run generate:bulk-template again)', '', '']);
  }
  wsCat.getColumn(1).width = 28;
  wsCat.getColumn(2).width = 28;
  wsCat.getColumn(3).width = 28;

  const ws = wb.addWorksheet('Your Products', { views: [{ state: 'frozen', ySplit: 1, xSplit: 6 }] });
  ws.addRow(headers);
  styleHeaderRow(ws.getRow(1));
  ws.addRow(buildSampleRow());
  ws.getRow(2).font = { italic: true, color: { argb: 'FF666666' } };

  headers.forEach((_, i) => {
    ws.getColumn(i + 1).width = i < 6 ? 24 : i < 6 + ABOUT_POINT_COUNT ? 28 : i < 6 + ABOUT_POINT_COUNT + 1 + SPEC_PAIR_COUNT * 2 ? 18 : 22;
  });

  const codCol = headers.findIndex((h) => h.startsWith('Cash on Delivery')) + 1;
  const shipCol = headers.findIndex((h) => h.startsWith('Ship to Other')) + 1;
  const yesNo = '"Yes,No"';
  for (let r = 2; r <= 500; r += 1) {
    ws.getCell(`${colLetter(codCol)}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [yesNo] };
    ws.getCell(`${colLetter(shipCol)}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [yesNo] };
  }

  const l1Unique = [...new Set(paths.map((p) => p.l1).filter(Boolean))];
  if (l1Unique.length) {
    const hidden = wb.addWorksheet('_MainCategories');
    hidden.state = 'veryHidden';
    l1Unique.forEach((name, i) => { hidden.getCell(i + 1, 1).value = name; });
    const catRef = `'_MainCategories'!$A$1:$A$${l1Unique.length}`;
    for (let r = 2; r <= 500; r += 1) {
      ws.getCell(`${colLetter(2)}${r}`).dataValidation = { type: 'list', allowBlank: r === 2, formulae: [catRef] };
    }
  }

  ws.getRow(1).eachCell((cell) => {
    const text = headerText(cell);
    if (COLUMN_NOTES[text]) {
      cell.note = COLUMN_NOTES[text];
    } else if (text.includes('*')) {
      cell.note = 'Required when you upload this file.';
    } else {
      cell.note = 'Optional — leave blank if not needed.';
    }
  });

  const outDir = path.resolve(process.cwd(), 'public', 'templates');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'BZEAD-Bulk-Product-Listing-Template.xlsx');
  await writeFile(outPath, await wb.xlsx.writeBuffer());
  console.log(`Wrote ${outPath} (${paths.length} category paths, ${headers.length} columns)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
