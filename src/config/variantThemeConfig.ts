// ============================================================================
// Variant Theme Config — maps product-type / subcategory slugs to predefined
// size options with international size charts (India, US, EU, JP).
// ============================================================================

export interface SizeChart {
  india?: string;
  us?: string;
  eu?: string;
  jp?: string;
}

export interface SizeOption {
  value: string;   // stored in DB  (e.g. "S", "UK 8", "128GB")
  label: string;   // shown in dropdown (same as value in most cases)
  chart?: SizeChart;
}

export interface VariantTheme {
  sizeLabel: string;       // heading above the size dropdown ("Size", "Storage", …)
  sizes: SizeOption[];     // predefined values the seller picks from
  allowCustomSize?: boolean; // let seller type a value not in the list
  hasColor: boolean;
  colorLabel?: string;     // default "Color"
}

// ── Reusable size presets ──────────────────────────────────────────────────

const APPAREL_ALPHA: SizeOption[] = [
  { value: 'XS',   label: 'XS',   chart: { india: '34', us: '0-2',  eu: '40', jp: 'XS' } },
  { value: 'S',    label: 'S',    chart: { india: '36', us: '4-6',  eu: '42', jp: 'S'  } },
  { value: 'M',    label: 'M',    chart: { india: '38', us: '8-10', eu: '44', jp: 'M'  } },
  { value: 'L',    label: 'L',    chart: { india: '40', us: '12-14',eu: '46', jp: 'L'  } },
  { value: 'XL',   label: 'XL',   chart: { india: '42', us: '16',   eu: '48', jp: 'LL' } },
  { value: 'XXL',  label: 'XXL',  chart: { india: '44', us: '18',   eu: '50', jp: '3L' } },
  { value: '3XL',  label: '3XL',  chart: { india: '46', us: '20',   eu: '52', jp: '4L' } },
  { value: '4XL',  label: '4XL',  chart: { india: '48', us: '22',   eu: '54', jp: '5L' } },
  { value: '5XL',  label: '5XL',  chart: { india: '50', us: '24',   eu: '56', jp: '6L' } },
];

const INNERWEAR_EXTENDED: SizeOption[] = [
  ...APPAREL_ALPHA,
  { value: '80',  label: '80',  chart: { india: '80 cm',  us: '31', eu: '80',  jp: '80' } },
  { value: '85',  label: '85',  chart: { india: '85 cm',  us: '33', eu: '85',  jp: '85' } },
  { value: '90',  label: '90',  chart: { india: '90 cm',  us: '35', eu: '90',  jp: '90' } },
  { value: '95',  label: '95',  chart: { india: '95 cm',  us: '37', eu: '95',  jp: '95' } },
  { value: '100', label: '100', chart: { india: '100 cm', us: '39', eu: '100', jp: '100' } },
];

const WAIST_SIZES: SizeOption[] = [
  { value: '28', label: '28', chart: { india: '28', us: '28', eu: '44', jp: '71 cm' } },
  { value: '30', label: '30', chart: { india: '30', us: '30', eu: '46', jp: '76 cm' } },
  { value: '32', label: '32', chart: { india: '32', us: '32', eu: '48', jp: '81 cm' } },
  { value: '34', label: '34', chart: { india: '34', us: '34', eu: '50', jp: '86 cm' } },
  { value: '36', label: '36', chart: { india: '36', us: '36', eu: '52', jp: '91 cm' } },
  { value: '38', label: '38', chart: { india: '38', us: '38', eu: '54', jp: '97 cm' } },
  { value: '40', label: '40', chart: { india: '40', us: '40', eu: '56', jp: '102 cm' } },
  { value: '42', label: '42', chart: { india: '42', us: '42', eu: '58', jp: '107 cm' } },
  { value: '44', label: '44', chart: { india: '44', us: '44', eu: '60', jp: '112 cm' } },
];

const MENS_SHOE: SizeOption[] = [
  { value: 'UK 3',    label: 'UK 3',    chart: { india: '3',    us: '4',    eu: '36',   jp: '21.5' } },
  { value: 'UK 3.5',  label: 'UK 3.5',  chart: { india: '3.5',  us: '4.5',  eu: '36.5', jp: '22' } },
  { value: 'UK 4',    label: 'UK 4',    chart: { india: '4',    us: '5',    eu: '37',   jp: '22.5' } },
  { value: 'UK 4.5',  label: 'UK 4.5',  chart: { india: '4.5',  us: '5.5',  eu: '37.5', jp: '23' } },
  { value: 'UK 5',    label: 'UK 5',    chart: { india: '5',    us: '6',    eu: '38',   jp: '23.5' } },
  { value: 'UK 5.5',  label: 'UK 5.5',  chart: { india: '5.5',  us: '6.5',  eu: '38.5', jp: '24' } },
  { value: 'UK 6',    label: 'UK 6',    chart: { india: '6',    us: '7',    eu: '39',   jp: '24.5' } },
  { value: 'UK 6.5',  label: 'UK 6.5',  chart: { india: '6.5',  us: '7.5',  eu: '39.5', jp: '25' } },
  { value: 'UK 7',    label: 'UK 7',    chart: { india: '7',    us: '8',    eu: '40',   jp: '25.5' } },
  { value: 'UK 7.5',  label: 'UK 7.5',  chart: { india: '7.5',  us: '8.5',  eu: '40.5', jp: '26' } },
  { value: 'UK 8',    label: 'UK 8',    chart: { india: '8',    us: '9',    eu: '41',   jp: '26.5' } },
  { value: 'UK 8.5',  label: 'UK 8.5',  chart: { india: '8.5',  us: '9.5',  eu: '41.5', jp: '27' } },
  { value: 'UK 9',    label: 'UK 9',    chart: { india: '9',    us: '10',   eu: '42',   jp: '27.5' } },
  { value: 'UK 9.5',  label: 'UK 9.5',  chart: { india: '9.5',  us: '10.5', eu: '42.5', jp: '28' } },
  { value: 'UK 10',   label: 'UK 10',   chart: { india: '10',   us: '11',   eu: '43',   jp: '28.5' } },
  { value: 'UK 10.5', label: 'UK 10.5', chart: { india: '10.5', us: '11.5', eu: '43.5', jp: '29' } },
  { value: 'UK 11',   label: 'UK 11',   chart: { india: '11',   us: '12',   eu: '44',   jp: '29.5' } },
  { value: 'UK 11.5', label: 'UK 11.5', chart: { india: '11.5', us: '12.5', eu: '44.5', jp: '30' } },
  { value: 'UK 12',   label: 'UK 12',   chart: { india: '12',   us: '13',   eu: '45',   jp: '30.5' } },
];

const WOMENS_SHOE: SizeOption[] = [
  { value: 'UK 3',    label: 'UK 3',    chart: { india: '3',    us: '5',    eu: '36',   jp: '22' } },
  { value: 'UK 3.5',  label: 'UK 3.5',  chart: { india: '3.5',  us: '5.5',  eu: '36.5', jp: '22.5' } },
  { value: 'UK 4',    label: 'UK 4',    chart: { india: '4',    us: '6',    eu: '37',   jp: '23' } },
  { value: 'UK 4.5',  label: 'UK 4.5',  chart: { india: '4.5',  us: '6.5',  eu: '37.5', jp: '23.5' } },
  { value: 'UK 5',    label: 'UK 5',    chart: { india: '5',    us: '7',    eu: '38',   jp: '24' } },
  { value: 'UK 5.5',  label: 'UK 5.5',  chart: { india: '5.5',  us: '7.5',  eu: '38.5', jp: '24.5' } },
  { value: 'UK 6',    label: 'UK 6',    chart: { india: '6',    us: '8',    eu: '39',   jp: '25' } },
  { value: 'UK 6.5',  label: 'UK 6.5',  chart: { india: '6.5',  us: '8.5',  eu: '39.5', jp: '25.5' } },
  { value: 'UK 7',    label: 'UK 7',    chart: { india: '7',    us: '9',    eu: '40',   jp: '26' } },
  { value: 'UK 7.5',  label: 'UK 7.5',  chart: { india: '7.5',  us: '9.5',  eu: '40.5', jp: '26.5' } },
  { value: 'UK 8',    label: 'UK 8',    chart: { india: '8',    us: '10',   eu: '41',   jp: '27' } },
  { value: 'UK 8.5',  label: 'UK 8.5',  chart: { india: '8.5',  us: '10.5', eu: '41.5', jp: '27.5' } },
  { value: 'UK 9',    label: 'UK 9',    chart: { india: '9',    us: '11',   eu: '42',   jp: '28' } },
  { value: 'UK 9.5',  label: 'UK 9.5',  chart: { india: '9.5',  us: '11.5', eu: '42.5', jp: '28.5' } },
  { value: 'UK 10',   label: 'UK 10',   chart: { india: '10',   us: '12',   eu: '43',   jp: '29' } },
];

const KIDS_AGE: SizeOption[] = [
  { value: '0-3 Months',  label: '0-3 Months',  chart: { india: 'Newborn', us: 'NB',     eu: '50-56',  jp: '50' } },
  { value: '3-6 Months',  label: '3-6 Months',  chart: { india: '0-6M',    us: '3-6M',   eu: '62-68',  jp: '60' } },
  { value: '6-12 Months', label: '6-12 Months', chart: { india: '6-12M',   us: '6-12M',  eu: '74-80',  jp: '70' } },
  { value: '1-2 Years',   label: '1-2 Years',   chart: { india: '1-2Y',    us: '12-24M', eu: '86-92',  jp: '80' } },
  { value: '2-3 Years',   label: '2-3 Years',   chart: { india: '2-3Y',    us: '2T-3T',  eu: '92-98',  jp: '90' } },
  { value: '3-4 Years',   label: '3-4 Years',   chart: { india: '3-4Y',    us: '3T-4T',  eu: '98-104', jp: '100' } },
  { value: '4-5 Years',   label: '4-5 Years',   chart: { india: '4-5Y',    us: '4-5',    eu: '104-110',jp: '110' } },
  { value: '5-6 Years',   label: '5-6 Years',   chart: { india: '5-6Y',    us: '5-6',    eu: '110-116',jp: '110' } },
  { value: '6-8 Years',   label: '6-8 Years',   chart: { india: '6-8Y',    us: '6-7',    eu: '116-128',jp: '120' } },
  { value: '8-10 Years',  label: '8-10 Years',  chart: { india: '8-10Y',   us: '8-10',   eu: '128-140',jp: '130' } },
  { value: '10-12 Years', label: '10-12 Years', chart: { india: '10-12Y',  us: '10-12',  eu: '140-152',jp: '140' } },
  { value: '12-14 Years', label: '12-14 Years', chart: { india: '12-14Y',  us: '14-16',  eu: '152-164',jp: '150' } },
];

const KIDS_SHOE: SizeOption[] = [
  { value: 'UK C4',  label: 'UK C4',  chart: { india: 'C4',  us: 'C5',  eu: '20', jp: '12' } },
  { value: 'UK C5',  label: 'UK C5',  chart: { india: 'C5',  us: 'C6',  eu: '21', jp: '13' } },
  { value: 'UK C6',  label: 'UK C6',  chart: { india: 'C6',  us: 'C7',  eu: '23', jp: '14' } },
  { value: 'UK C7',  label: 'UK C7',  chart: { india: 'C7',  us: 'C8',  eu: '24', jp: '15' } },
  { value: 'UK C8',  label: 'UK C8',  chart: { india: 'C8',  us: 'C9',  eu: '25', jp: '16' } },
  { value: 'UK C9',  label: 'UK C9',  chart: { india: 'C9',  us: 'C10', eu: '27', jp: '17' } },
  { value: 'UK C10', label: 'UK C10', chart: { india: 'C10', us: 'C11', eu: '28', jp: '17.5' } },
  { value: 'UK C11', label: 'UK C11', chart: { india: 'C11', us: 'C12', eu: '29', jp: '18' } },
  { value: 'UK C12', label: 'UK C12', chart: { india: 'C12', us: 'C13', eu: '30', jp: '19' } },
  { value: 'UK 1',   label: 'UK 1',   chart: { india: '1',   us: '2',   eu: '33', jp: '20.5' } },
  { value: 'UK 2',   label: 'UK 2',   chart: { india: '2',   us: '3',   eu: '34', jp: '21.5' } },
  { value: 'UK 3',   label: 'UK 3',   chart: { india: '3',   us: '4',   eu: '35', jp: '22' } },
  { value: 'UK 4',   label: 'UK 4',   chart: { india: '4',   us: '5',   eu: '36', jp: '23' } },
  { value: 'UK 5',   label: 'UK 5',   chart: { india: '5',   us: '6',   eu: '37', jp: '24' } },
];

const PHONE_STORAGE: SizeOption[] = [
  { value: '32 GB',  label: '32 GB' },
  { value: '64 GB',  label: '64 GB' },
  { value: '128 GB', label: '128 GB' },
  { value: '256 GB', label: '256 GB' },
  { value: '512 GB', label: '512 GB' },
  { value: '1 TB',   label: '1 TB' },
];

const LAPTOP_STORAGE: SizeOption[] = [
  { value: '128 GB SSD', label: '128 GB SSD' },
  { value: '256 GB SSD', label: '256 GB SSD' },
  { value: '512 GB SSD', label: '512 GB SSD' },
  { value: '1 TB SSD',   label: '1 TB SSD' },
  { value: '1 TB HDD',   label: '1 TB HDD' },
  { value: '2 TB HDD',   label: '2 TB HDD' },
];

const SCREEN_SIZES: SizeOption[] = [
  { value: '24 inch', label: '24 inch' },
  { value: '27 inch', label: '27 inch' },
  { value: '32 inch', label: '32 inch' },
  { value: '40 inch', label: '40 inch' },
  { value: '43 inch', label: '43 inch' },
  { value: '50 inch', label: '50 inch' },
  { value: '55 inch', label: '55 inch' },
  { value: '65 inch', label: '65 inch' },
  { value: '75 inch', label: '75 inch' },
  { value: '85 inch', label: '85 inch' },
];

const BEAUTY_VOLUME: SizeOption[] = [
  { value: '15 ml',  label: '15 ml' },
  { value: '30 ml',  label: '30 ml' },
  { value: '50 ml',  label: '50 ml' },
  { value: '100 ml', label: '100 ml' },
  { value: '200 ml', label: '200 ml' },
  { value: '250 ml', label: '250 ml' },
  { value: '500 ml', label: '500 ml' },
  { value: '1 L',    label: '1 L' },
];

const GROCERY_WEIGHT: SizeOption[] = [
  { value: '50 g',   label: '50 g' },
  { value: '100 g',  label: '100 g' },
  { value: '200 g',  label: '200 g' },
  { value: '250 g',  label: '250 g' },
  { value: '500 g',  label: '500 g' },
  { value: '1 kg',   label: '1 kg' },
  { value: '2 kg',   label: '2 kg' },
  { value: '5 kg',   label: '5 kg' },
  { value: '10 kg',  label: '10 kg' },
  { value: '25 kg',  label: '25 kg' },
];

const RING_SIZES: SizeOption[] = [
  { value: '6',  label: '6',  chart: { india: '6',  us: '3',    eu: '44',   jp: '5' } },
  { value: '7',  label: '7',  chart: { india: '7',  us: '3.5',  eu: '45.5', jp: '6' } },
  { value: '8',  label: '8',  chart: { india: '8',  us: '4',    eu: '46.5', jp: '7' } },
  { value: '9',  label: '9',  chart: { india: '9',  us: '4.5',  eu: '48',   jp: '8' } },
  { value: '10', label: '10', chart: { india: '10', us: '5',    eu: '49',   jp: '9' } },
  { value: '11', label: '11', chart: { india: '11', us: '5.5',  eu: '50.5', jp: '10' } },
  { value: '12', label: '12', chart: { india: '12', us: '6',    eu: '51.5', jp: '11' } },
  { value: '13', label: '13', chart: { india: '13', us: '6.5',  eu: '52.5', jp: '12' } },
  { value: '14', label: '14', chart: { india: '14', us: '7',    eu: '54',   jp: '13' } },
  { value: '15', label: '15', chart: { india: '15', us: '7.5',  eu: '55',   jp: '14' } },
  { value: '16', label: '16', chart: { india: '16', us: '8',    eu: '56.5', jp: '15' } },
  { value: '17', label: '17', chart: { india: '17', us: '8',    eu: '57',   jp: '16' } },
  { value: '18', label: '18', chart: { india: '18', us: '8.5',  eu: '58',   jp: '17' } },
  { value: '20', label: '20', chart: { india: '20', us: '9.5',  eu: '60.5', jp: '19' } },
  { value: '22', label: '22', chart: { india: '22', us: '10',   eu: '63',   jp: '21' } },
  { value: '24', label: '24', chart: { india: '24', us: '11',   eu: '65',   jp: '23' } },
];

const BOOK_FORMAT: SizeOption[] = [
  { value: 'Paperback', label: 'Paperback' },
  { value: 'Hardcover', label: 'Hardcover' },
  { value: 'Spiral Bound', label: 'Spiral Bound' },
];

const CONSOLE_STORAGE: SizeOption[] = [
  { value: '256 GB', label: '256 GB' },
  { value: '512 GB', label: '512 GB' },
  { value: '825 GB', label: '825 GB' },
  { value: '1 TB',   label: '1 TB' },
  { value: '2 TB',   label: '2 TB' },
];

const BED_SIZES: SizeOption[] = [
  { value: 'Single',      label: 'Single',      chart: { india: '36×72 in',  us: 'Twin',     eu: '90×200 cm', jp: 'S (97×195)' } },
  { value: 'Double',      label: 'Double',      chart: { india: '48×72 in',  us: 'Full',     eu: '140×200 cm',jp: 'SD (120×195)' } },
  { value: 'Queen',       label: 'Queen',       chart: { india: '60×72 in',  us: 'Queen',    eu: '160×200 cm',jp: 'D (140×195)' } },
  { value: 'King',        label: 'King',        chart: { india: '72×72 in',  us: 'King',     eu: '180×200 cm',jp: 'Q (160×195)' } },
  { value: 'Super King',  label: 'Super King',  chart: { india: '72×78 in',  us: 'Cal King',  eu: '200×200 cm',jp: 'K (180×195)' } },
];

const BEDSHEET_SIZES: SizeOption[] = [
  { value: 'Single',      label: 'Single (60×90 in)' },
  { value: 'Double',      label: 'Double (90×100 in)' },
  { value: 'Queen',       label: 'Queen (90×108 in)' },
  { value: 'King',        label: 'King (108×108 in)' },
];

const TOWEL_SIZES: SizeOption[] = [
  { value: 'Face Towel',  label: 'Face Towel (12×12 in)' },
  { value: 'Hand Towel',  label: 'Hand Towel (16×28 in)' },
  { value: 'Bath Towel',  label: 'Bath Towel (27×54 in)' },
  { value: 'Bath Sheet',  label: 'Bath Sheet (35×60 in)' },
];

const BRA_SIZES: SizeOption[] = [
  { value: '28A', label: '28A' }, { value: '28B', label: '28B' }, { value: '28C', label: '28C' },
  { value: '30A', label: '30A' }, { value: '30B', label: '30B' }, { value: '30C', label: '30C' }, { value: '30D', label: '30D' },
  { value: '32A', label: '32A' }, { value: '32B', label: '32B' }, { value: '32C', label: '32C' }, { value: '32D', label: '32D' }, { value: '32DD', label: '32DD' },
  { value: '34A', label: '34A' }, { value: '34B', label: '34B' }, { value: '34C', label: '34C' }, { value: '34D', label: '34D' }, { value: '34DD', label: '34DD' },
  { value: '36A', label: '36A' }, { value: '36B', label: '36B' }, { value: '36C', label: '36C' }, { value: '36D', label: '36D' }, { value: '36DD', label: '36DD' },
  { value: '38B', label: '38B' }, { value: '38C', label: '38C' }, { value: '38D', label: '38D' }, { value: '38DD', label: '38DD' },
  { value: '40B', label: '40B' }, { value: '40C', label: '40C' }, { value: '40D', label: '40D' },
  { value: '42B', label: '42B' }, { value: '42C', label: '42C' }, { value: '42D', label: '42D' },
  { value: '44B', label: '44B' }, { value: '44C', label: '44C' },
];

const STOCKING_SIZES: SizeOption[] = [
  { value: 'S',  label: 'S',  chart: { india: 'S (155-165 cm)',  us: 'S',  eu: 'S',  jp: 'M' } },
  { value: 'M',  label: 'M',  chart: { india: 'M (160-170 cm)',  us: 'M',  eu: 'M',  jp: 'L' } },
  { value: 'L',  label: 'L',  chart: { india: 'L (165-175 cm)',  us: 'L',  eu: 'L',  jp: 'LL' } },
  { value: 'XL', label: 'XL', chart: { india: 'XL (170-180 cm)', us: 'XL', eu: 'XL', jp: '3L' } },
];

const FREE_SIZE: SizeOption[] = [
  { value: 'Free Size', label: 'Free Size' },
];

const PACK_COUNT: SizeOption[] = [
  { value: '1 Pack', label: '1 Pack' },
  { value: '2 Pack', label: '2 Pack' },
  { value: '4 Pack', label: '4 Pack' },
  { value: '6 Pack', label: '6 Pack' },
  { value: '10 Pack', label: '10 Pack' },
  { value: '12 Pack', label: '12 Pack' },
];

const APPLIANCE_CAPACITY: SizeOption[] = [
  { value: '5 L', label: '5 L' },
  { value: '6 kg', label: '6 kg' },
  { value: '7 kg', label: '7 kg' },
  { value: '8 kg', label: '8 kg' },
  { value: '10 kg', label: '10 kg' },
  { value: '1 Ton', label: '1 Ton' },
  { value: '1.5 Ton', label: '1.5 Ton' },
  { value: '2 Ton', label: '2 Ton' },
];

// ── Theme definitions ──────────────────────────────────────────────────────

const clothingAlpha: VariantTheme = {
  sizeLabel: 'Size',
  sizes: APPAREL_ALPHA,
  hasColor: true,
};

const innerwearExtended: VariantTheme = {
  sizeLabel: 'Size',
  sizes: INNERWEAR_EXTENDED,
  hasColor: true,
};

const clothingWaist: VariantTheme = {
  sizeLabel: 'Waist Size',
  sizes: WAIST_SIZES,
  hasColor: true,
};

const mensFootwear: VariantTheme = {
  sizeLabel: 'Shoe Size',
  sizes: MENS_SHOE,
  hasColor: true,
};

const womensFootwear: VariantTheme = {
  sizeLabel: 'Shoe Size',
  sizes: WOMENS_SHOE,
  hasColor: true,
};

const kidsClothing: VariantTheme = {
  sizeLabel: 'Age / Size',
  sizes: KIDS_AGE,
  hasColor: true,
};

const kidsFootwear: VariantTheme = {
  sizeLabel: 'Shoe Size',
  sizes: KIDS_SHOE,
  hasColor: true,
};

const braTheme: VariantTheme = {
  sizeLabel: 'Bra Size',
  sizes: BRA_SIZES,
  hasColor: true,
};

const stockingTheme: VariantTheme = {
  sizeLabel: 'Size',
  sizes: STOCKING_SIZES,
  hasColor: true,
};

const phoneStorage: VariantTheme = {
  sizeLabel: 'Storage',
  sizes: PHONE_STORAGE,
  hasColor: true,
};

const laptopStorage: VariantTheme = {
  sizeLabel: 'Storage',
  sizes: LAPTOP_STORAGE,
  hasColor: true,
};

const screenSize: VariantTheme = {
  sizeLabel: 'Screen Size',
  sizes: SCREEN_SIZES,
  hasColor: false,
};

const colorOnly: VariantTheme = {
  sizeLabel: '',
  sizes: [],
  hasColor: true,
};

const noVariants: VariantTheme = {
  sizeLabel: 'Size',
  sizes: FREE_SIZE,
  hasColor: true,
};

const beautyVolume: VariantTheme = {
  sizeLabel: 'Size',
  sizes: BEAUTY_VOLUME,
  hasColor: false,
};

const beautyShade: VariantTheme = {
  sizeLabel: 'Size',
  sizes: BEAUTY_VOLUME,
  hasColor: true,
  colorLabel: 'Shade',
};

const groceryWeight: VariantTheme = {
  sizeLabel: 'Pack Size',
  sizes: GROCERY_WEIGHT,
  hasColor: false,
};

const bookFormat: VariantTheme = {
  sizeLabel: 'Format',
  sizes: BOOK_FORMAT,
  hasColor: false,
};

const consoleStorage: VariantTheme = {
  sizeLabel: 'Storage',
  sizes: CONSOLE_STORAGE,
  hasColor: true,
};

const ringSize: VariantTheme = {
  sizeLabel: 'Ring Size',
  sizes: RING_SIZES,
  hasColor: true,
  colorLabel: 'Metal',
};

const bedSize: VariantTheme = {
  sizeLabel: 'Bed Size',
  sizes: BED_SIZES,
  hasColor: true,
  colorLabel: 'Finish',
};

const bedsheetSize: VariantTheme = {
  sizeLabel: 'Bed Size',
  sizes: BEDSHEET_SIZES,
  hasColor: true,
  colorLabel: 'Color / Pattern',
};

const towelSize: VariantTheme = {
  sizeLabel: 'Towel Size',
  sizes: TOWEL_SIZES,
  hasColor: true,
};

const freeSize: VariantTheme = {
  sizeLabel: 'Size',
  sizes: FREE_SIZE,
  hasColor: true,
};

const packCount: VariantTheme = {
  sizeLabel: 'Pack Size',
  sizes: PACK_COUNT,
  hasColor: false,
};

const applianceCapacity: VariantTheme = {
  sizeLabel: 'Capacity',
  sizes: APPLIANCE_CAPACITY,
  allowCustomSize: true,
  hasColor: true,
};

// ── Product-type slug → theme mapping ──────────────────────────────────────
// Most specific key wins.  Fallback chain:
//   productTypeSlug → subCategorySlug → categorySlug → FALLBACK

const PRODUCT_TYPE_THEMES: Record<string, VariantTheme> = {
  // ────── FASHION — Men ──────
  'shirts':          clothingAlpha,
  't-shirts':        clothingAlpha,
  'jeans':           clothingWaist,
  'trousers':        clothingWaist,
  'jackets':         clothingAlpha,
  'mens-footwear':   mensFootwear,

  // ────── FASHION — Women ──────
  'dresses':         clothingAlpha,
  'tops':            clothingAlpha,
  'skirts':          clothingAlpha,
  'handbags':        colorOnly,
  'womens-footwear': womensFootwear,

  // ────── FASHION — Kids ──────
  'boys-clothing':   kidsClothing,
  'girls-clothing':  kidsClothing,
  'school-wear':     kidsClothing,
  'kids-footwear':   kidsFootwear,
  'baby-clothing':   kidsClothing,

  // ────── FASHION — Footwear ──────
  'sneakers':        mensFootwear,
  'sandals':         mensFootwear,
  'formal-shoes':    mensFootwear,
  'boots':           mensFootwear,
  'slippers':        mensFootwear,

  // ────── FASHION — Accessories ──────
  'watches':         colorOnly,
  'sunglasses':      colorOnly,
  'belts':           { sizeLabel: 'Belt Size', sizes: WAIST_SIZES, hasColor: true },
  'wallets':         colorOnly,
  'jewelry':         ringSize,

  // ────── ELECTRONICS — Phones ──────
  'smartphones':     phoneStorage,
  'feature-phones':  phoneStorage,
  'chargers-cables': noVariants,
  'phone-cases':     colorOnly,
  'screen-protectors': noVariants,

  // ────── ELECTRONICS — Computers ──────
  'laptops':         laptopStorage,
  'desktops':        laptopStorage,
  'monitors':        screenSize,
  'keyboards-mice':  colorOnly,

  // ────── ELECTRONICS — Audio ──────
  'headphones':      colorOnly,
  'earbuds':         colorOnly,
  'speakers':        colorOnly,
  'soundbars':       colorOnly,

  // ────── ELECTRONICS — Cameras ──────
  'dslr':            colorOnly,
  'mirrorless':      colorOnly,
  'action-cameras':  colorOnly,
  'camera-lenses':   noVariants,
  'camera-accessories': noVariants,

  // ────── ELECTRONICS — Smart Devices ──────
  'smartwatches':    colorOnly,
  'smart-home':      colorOnly,
  'smart-bands':     colorOnly,
  'smart-lighting':  colorOnly,

  // ────── ELECTRONICS — TV ──────
  'televisions':     screenSize,
  'streaming-devices': noVariants,
  'projectors':      noVariants,
  'tv-accessories':  noVariants,

  // ────── ELECTRONICS — Networking ──────
  'routers':         noVariants,
  'modems':          noVariants,
  'wifi-extenders':  noVariants,

  // ────── ELECTRONICS — Computer Components ──────
  'processors':      noVariants,
  'motherboards':    noVariants,
  'graphics-cards':  noVariants,
  'ram':             { sizeLabel: 'Capacity', sizes: [
    { value: '4 GB', label: '4 GB' }, { value: '8 GB', label: '8 GB' },
    { value: '16 GB', label: '16 GB' }, { value: '32 GB', label: '32 GB' },
    { value: '64 GB', label: '64 GB' },
  ], hasColor: false },
  'internal-storage': { sizeLabel: 'Capacity', sizes: [
    { value: '128 GB', label: '128 GB' }, { value: '256 GB', label: '256 GB' },
    { value: '512 GB', label: '512 GB' }, { value: '1 TB', label: '1 TB' },
    { value: '2 TB', label: '2 TB' }, { value: '4 TB', label: '4 TB' },
  ], hasColor: false },
  'external-storage': { sizeLabel: 'Capacity', sizes: [
    { value: '256 GB', label: '256 GB' }, { value: '500 GB', label: '500 GB' },
    { value: '1 TB', label: '1 TB' }, { value: '2 TB', label: '2 TB' },
    { value: '4 TB', label: '4 TB' }, { value: '5 TB', label: '5 TB' },
  ], hasColor: false },
  'power-banks':     { sizeLabel: 'Capacity', sizes: [
    { value: '5000 mAh', label: '5000 mAh' }, { value: '10000 mAh', label: '10000 mAh' },
    { value: '20000 mAh', label: '20000 mAh' }, { value: '30000 mAh', label: '30000 mAh' },
  ], hasColor: true },

  // ────── HOME & KITCHEN — Furniture ──────
  'sofas':           colorOnly,
  'beds':            bedSize,
  'tables':          { sizeLabel: 'Seating', sizes: [
    { value: '2 Seater', label: '2 Seater' }, { value: '4 Seater', label: '4 Seater' },
    { value: '6 Seater', label: '6 Seater' }, { value: '8 Seater', label: '8 Seater' },
  ], hasColor: true, colorLabel: 'Finish' },
  'chairs':          colorOnly,
  'cabinets':        colorOnly,

  // ────── HOME & KITCHEN — Kitchen ──────
  'cookware':        { sizeLabel: 'Size', sizes: [
    { value: 'Small', label: 'Small' }, { value: 'Medium', label: 'Medium' },
    { value: 'Large', label: 'Large' },
  ], hasColor: true },
  'storage':         noVariants,
  'kitchen-appliances': colorOnly,
  'kitchen-tools':   noVariants,
  'storage-containers': { sizeLabel: 'Capacity', sizes: [
    { value: '500 ml', label: '500 ml' }, { value: '1 L', label: '1 L' },
    { value: '2 L', label: '2 L' }, { value: '5 L', label: '5 L' },
  ], hasColor: true },

  // ────── HOME & KITCHEN — Dining ──────
  'dinner-sets':     { sizeLabel: 'Pieces', sizes: [
    { value: '12 Piece', label: '12 Piece' }, { value: '18 Piece', label: '18 Piece' },
    { value: '24 Piece', label: '24 Piece' }, { value: '36 Piece', label: '36 Piece' },
  ], hasColor: true, colorLabel: 'Design' },
  'glassware':       noVariants,
  'cutlery':         noVariants,
  'tableware':       noVariants,

  // ────── HOME & KITCHEN — Decor ──────
  'wall-art':        noVariants,
  'lighting':        colorOnly,
  'decorative-items': noVariants,

  // ────── HOME & KITCHEN — Bedding & Bath ──────
  'bedsheets':       bedsheetSize,
  'pillows':         { sizeLabel: 'Size', sizes: [
    { value: 'Standard', label: 'Standard (20×26 in)' },
    { value: 'Queen', label: 'Queen (20×30 in)' },
    { value: 'King', label: 'King (20×36 in)' },
  ], hasColor: true },
  'blankets':        bedsheetSize,
  'towels':          towelSize,

  // ────── HOME & KITCHEN — Storage & Organization ──────
  'storage-boxes':   noVariants,
  'wardrobe-organizers': noVariants,
  'shelves':         colorOnly,

  // ────── BEAUTY & HEALTH — Skincare ──────
  'face-creams':     beautyVolume,
  'face-wash':       beautyVolume,
  'sunscreen':       beautyVolume,
  'serums':          beautyVolume,
  'toners':          beautyVolume,
  'skin-care-kits':  beautyVolume,

  // ────── BEAUTY & HEALTH — Haircare ──────
  'shampoo':         beautyVolume,
  'conditioner':     beautyVolume,
  'hair-oil':        beautyVolume,
  'hair-styling':    beautyVolume,

  // ────── BEAUTY & HEALTH — Makeup ──────
  'lipstick':        beautyShade,
  'foundation':      beautyShade,
  'eye-makeup':      beautyShade,
  'makeup-kits':     noVariants,

  // ────── BEAUTY & HEALTH — Grooming ──────
  'trimmers':        colorOnly,
  'shavers':         colorOnly,
  'grooming-kits':   noVariants,

  // ────── BEAUTY & HEALTH — Fragrance ──────
  'perfumes':        { sizeLabel: 'Size', sizes: [
    { value: '30 ml', label: '30 ml' }, { value: '50 ml', label: '50 ml' },
    { value: '100 ml', label: '100 ml' }, { value: '200 ml', label: '200 ml' },
  ], hasColor: false },
  'body-sprays':     { sizeLabel: 'Size', sizes: [
    { value: '100 ml', label: '100 ml' }, { value: '150 ml', label: '150 ml' },
    { value: '200 ml', label: '200 ml' },
  ], hasColor: false },

  // ────── BEAUTY & HEALTH — Supplements ──────
  'vitamins':        groceryWeight,
  'protein-supplements': groceryWeight,
  'herbal-supplements': groceryWeight,

  // ────── GROCERY — Snacks ──────
  'chips':           groceryWeight,
  'biscuits':        groceryWeight,
  'chocolate':       groceryWeight,

  // ────── GROCERY — Beverages ──────
  'tea':             groceryWeight,
  'coffee':          groceryWeight,
  'soft-drinks':     { sizeLabel: 'Size', sizes: [
    { value: '250 ml', label: '250 ml' }, { value: '300 ml', label: '300 ml' },
    { value: '500 ml', label: '500 ml' }, { value: '1 L', label: '1 L' },
    { value: '1.5 L', label: '1.5 L' }, { value: '2 L', label: '2 L' },
  ], hasColor: false },
  'energy-drinks':   { sizeLabel: 'Size', sizes: [
    { value: '250 ml', label: '250 ml' }, { value: '355 ml', label: '355 ml' },
    { value: '500 ml', label: '500 ml' },
  ], hasColor: false },

  // ────── GROCERY — Packaged Food ──────
  'instant-noodles': groceryWeight,
  'pasta':           groceryWeight,
  'ready-meals':     groceryWeight,

  // ────── GROCERY — Staples ──────
  'rice':            groceryWeight,
  'flour':           groceryWeight,
  'pulses':          groceryWeight,
  'cooking-oil':     { sizeLabel: 'Size', sizes: [
    { value: '500 ml', label: '500 ml' }, { value: '1 L', label: '1 L' },
    { value: '2 L', label: '2 L' }, { value: '5 L', label: '5 L' },
    { value: '15 L', label: '15 L' },
  ], hasColor: false },

  // ────── GROCERY — Household ──────
  'cleaning-supplies': noVariants,
  'laundry-products':  groceryWeight,
  'paper-products':    packCount,
  'hhs-tissue':        packCount,

  // ────── SPORTS — Fitness ──────
  'treadmills':      noVariants,
  'dumbbells':       { sizeLabel: 'Weight', sizes: [
    { value: '1 kg', label: '1 kg' }, { value: '2 kg', label: '2 kg' },
    { value: '3 kg', label: '3 kg' }, { value: '5 kg', label: '5 kg' },
    { value: '7.5 kg', label: '7.5 kg' }, { value: '10 kg', label: '10 kg' },
    { value: '15 kg', label: '15 kg' }, { value: '20 kg', label: '20 kg' },
  ], hasColor: false },
  'resistance-bands': { sizeLabel: 'Resistance', sizes: [
    { value: 'Light', label: 'Light' }, { value: 'Medium', label: 'Medium' },
    { value: 'Heavy', label: 'Heavy' }, { value: 'Extra Heavy', label: 'Extra Heavy' },
  ], hasColor: true },

  // ────── SPORTS — Cycling ──────
  'bicycles':        { sizeLabel: 'Frame Size', sizes: [
    { value: '14 inch', label: '14 inch' }, { value: '16 inch', label: '16 inch' },
    { value: '18 inch', label: '18 inch' }, { value: '20 inch', label: '20 inch' },
    { value: '24 inch', label: '24 inch' }, { value: '26 inch', label: '26 inch' },
    { value: '27.5 inch', label: '27.5 inch' }, { value: '29 inch', label: '29 inch' },
  ], hasColor: true },
  'cycling-helmets': { sizeLabel: 'Size', sizes: [
    { value: 'S (52-55 cm)', label: 'S (52-55 cm)' },
    { value: 'M (55-58 cm)', label: 'M (55-58 cm)' },
    { value: 'L (58-61 cm)', label: 'L (58-61 cm)' },
    { value: 'XL (61-64 cm)', label: 'XL (61-64 cm)' },
  ], hasColor: true },
  'cycling-accessories': noVariants,

  // ────── SPORTS — Camping ──────
  'tents':           { sizeLabel: 'Capacity', sizes: [
    { value: '1 Person', label: '1 Person' }, { value: '2 Person', label: '2 Person' },
    { value: '3 Person', label: '3 Person' }, { value: '4 Person', label: '4 Person' },
    { value: '6 Person', label: '6 Person' },
  ], hasColor: true },
  'sleeping-bags':   clothingAlpha,
  'camping-tools':   noVariants,

  // ────── SPORTS — Outdoor ──────
  'backpacks':       { sizeLabel: 'Capacity', sizes: [
    { value: '15 L', label: '15 L' }, { value: '20 L', label: '20 L' },
    { value: '30 L', label: '30 L' }, { value: '40 L', label: '40 L' },
    { value: '50 L', label: '50 L' }, { value: '60 L', label: '60 L' },
    { value: '70 L', label: '70 L' },
  ], hasColor: true },
  'outdoor-clothing': clothingAlpha,
  'survival-gear':   noVariants,

  // ────── TOYS & BABY ──────
  'action-figures':  noVariants,
  'board-games':     noVariants,
  'educational-toys': noVariants,
  'baby-feeding':    noVariants,
  'baby-hygiene':    noVariants,
  'school-bags':     colorOnly,
  'stationery':      noVariants,
  'lunch-boxes':     colorOnly,

  // ────── AUTOMOTIVE ──────
  'seat-covers':     colorOnly,
  'car-electronics': noVariants,
  'car-cleaning':    noVariants,
  'bike-helmets':    { sizeLabel: 'Size', sizes: [
    { value: 'S (55-56 cm)', label: 'S (55-56 cm)' },
    { value: 'M (57-58 cm)', label: 'M (57-58 cm)' },
    { value: 'L (59-60 cm)', label: 'L (59-60 cm)' },
    { value: 'XL (61-62 cm)', label: 'XL (61-62 cm)' },
  ], hasColor: true },
  'riding-gear':     clothingAlpha,
  'car-tools':       noVariants,
  'repair-kits':     noVariants,

  // ────── BOOKS & MEDIA ──────
  'fiction':         bookFormat,
  'non-fiction':     bookFormat,
  'childrens-books': bookFormat,
  'academic-books':  bookFormat,
  'competitive-exam-books': bookFormat,
  'dvd':            noVariants,
  'blu-ray':        noVariants,
  'cds':            noVariants,
  'vinyl-records':  noVariants,

  // ────── GAMING ──────
  'playstation':     consoleStorage,
  'xbox':            consoleStorage,
  'nintendo':        consoleStorage,
  'console-games':   noVariants,
  'pc-games':        noVariants,
  'controllers':     colorOnly,
  'gaming-headsets':  colorOnly,
  'gaming-keyboards': colorOnly,

  // ────── PETS ──────
  'dog-food':        groceryWeight,
  'cat-food':        groceryWeight,
  'pet-beds':        { sizeLabel: 'Size', sizes: [
    { value: 'Small', label: 'Small' }, { value: 'Medium', label: 'Medium' },
    { value: 'Large', label: 'Large' }, { value: 'Extra Large', label: 'Extra Large' },
  ], hasColor: true },
  'pet-toys':        noVariants,
  'grooming-tools':  noVariants,
  'pet-hygiene':     noVariants,

  // ────── FASHION — Men's Innerwear ──────
  'mens-brief':               innerwearExtended,
  'mens-trunk':               innerwearExtended,
  'mens-long-trunk':          innerwearExtended,
  'mens-mini-trunk':          innerwearExtended,
  'mens-boxer-brief':         innerwearExtended,
  'mens-boxer-shorts':        clothingWaist,
  'mens-bikini-brief':        innerwearExtended,
  'mens-thong':               innerwearExtended,
  'mens-g-string':            innerwearExtended,
  'mens-jockstrap':           innerwearExtended,
  'mens-sleeveless-vest':     innerwearExtended,
  'mens-half-sleeve-vest':    innerwearExtended,
  'mens-vneck-undershirt':    innerwearExtended,
  'mens-crewneck-undershirt': innerwearExtended,
  'mens-lounge-pants':        clothingWaist,
  'mens-lounge-shorts':       innerwearExtended,
  'mens-thermal-top':         innerwearExtended,
  'mens-thermal-bottom':      innerwearExtended,
  'mens-thermal-set':         innerwearExtended,
  'mens-compression-shorts':  innerwearExtended,

  // ────── FASHION — Women's Innerwear ──────
  'womens-hipster-panty':     innerwearExtended,
  'womens-bikini-panty':      innerwearExtended,
  'womens-brief-panty':       innerwearExtended,
  'womens-high-waist-panty':  innerwearExtended,
  'womens-thong':             innerwearExtended,
  'womens-g-string':          innerwearExtended,
  'womens-boy-shorts':        innerwearExtended,
  'womens-bloomer':           innerwearExtended,
  'womens-period-panty':      innerwearExtended,
  'womens-maternity-panty':   innerwearExtended,
  'womens-everyday-bra':      braTheme,
  'womens-padded-bra':        braTheme,
  'womens-non-padded-bra':    braTheme,
  'womens-bralette':          clothingAlpha,
  'womens-bandeau-bra':       clothingAlpha,
  'womens-strapless-bra':     braTheme,
  'womens-sports-bra':        clothingAlpha,
  'womens-push-up-bra':       braTheme,
  'womens-balconette-bra':    braTheme,
  'womens-plunge-bra':        braTheme,
  'womens-minimizer-bra':     braTheme,
  'womens-nursing-bra':       braTheme,
  'womens-longline-bra':      braTheme,
  'womens-stick-on-bra':      clothingAlpha,
  'womens-convertible-bra':   braTheme,
  'womens-camisole':          clothingAlpha,
  'womens-shapewear':         clothingAlpha,
  'womens-saree-shapewear':   clothingWaist,
  'womens-slip':              clothingAlpha,
  'womens-stockings':         stockingTheme,
  'womens-thermal-top':       clothingAlpha,
  'womens-thermal-bottom':    clothingAlpha,
  'womens-thermal-set':       clothingAlpha,
  'womens-lounge-shorts':     clothingAlpha,
  'womens-lounge-pants':      clothingAlpha,

  // ────── FASHION — Kids Innerwear ──────
  'kids-boys-brief':           kidsClothing,
  'kids-boys-trunk':           kidsClothing,
  'kids-boys-boxer-shorts':    kidsClothing,
  'kids-boys-vest':            kidsClothing,
  'kids-boys-thermal-top':     kidsClothing,
  'kids-boys-thermal-bottom':  kidsClothing,
  'kids-boys-thermal-set':     kidsClothing,
  'kids-girls-hipster-panty':  kidsClothing,
  'kids-girls-brief-panty':    kidsClothing,
  'kids-girls-bloomer':        kidsClothing,
  'kids-girls-boy-shorts':     kidsClothing,
  'kids-girls-vest':           kidsClothing,
  'kids-girls-camisole':       kidsClothing,
  'kids-girls-padded-camisole':kidsClothing,
  'kids-girls-training-bra':   kidsClothing,
  'kids-girls-sports-bra':     kidsClothing,
  'kids-girls-thermal-top':    kidsClothing,
  'kids-girls-thermal-bottom': kidsClothing,
  'kids-baby-vest':            kidsClothing,
  'kids-baby-brief':           kidsClothing,

  // ────── FASHION — Ethnic Wear ──────
  'mens-kurtas':       clothingAlpha,
  'mens-sherwanis':    clothingAlpha,
  'dhotis-lungis':     freeSize,
  'nehru-jackets':     clothingAlpha,
  'sarees':            freeSize,
  'salwar-suits':      clothingAlpha,
  'lehengas':          clothingAlpha,
  'kurtis':            clothingAlpha,
  'dupattas':          freeSize,

  // ────── FASHION — Sportswear ──────
  'track-pants':       clothingAlpha,
  'sports-bras':       clothingAlpha,
  'gym-shorts':        clothingAlpha,
  'compression-wear':  clothingAlpha,

  // ────── FASHION — Swimwear ──────
  'mens-swimwear':     clothingAlpha,
  'womens-swimwear':   clothingAlpha,
  'kids-swimwear':     kidsClothing,

  // ────── FASHION — Bags & Eyewear ──────
  'bl-backpacks':      colorOnly,
  'bl-handbags':       colorOnly,
  'bl-suitcases':      colorOnly,
  'bl-duffel-bags':    colorOnly,
  'bl-wallets':        colorOnly,
  'sa-sunglasses':     colorOnly,
  'sa-eyeglass-frames': colorOnly,

  // ────── ELECTRONICS — Printers / Drones / Tablets ──────
  'el-inkjet':         colorOnly,
  'el-laser':          colorOnly,
  'el-scanners':       noVariants,
  'el-3d-printers':    noVariants,
  'camera-drones':     colorOnly,
  'fpv-drones':        colorOnly,
  'drone-accessories': noVariants,
  'tab-android':       laptopStorage,
  'tab-ipads':         laptopStorage,
  'tab-windows':       laptopStorage,
  'tab-ereaders':      noVariants,

  // ────── HOME & KITCHEN — Extras ──────
  'mixer-grinders':    colorOnly,
  'juicers':           colorOnly,
  'food-processors':   colorOnly,
  'microwave-ovens':   colorOnly,
  'toasters':          colorOnly,
  'electric-kettles':  colorOnly,
  'air-fryers':        colorOnly,
  'induction-cooktops': colorOnly,
  'soap-dispensers':   colorOnly,
  'shower-curtains':   colorOnly,
  'li-irons':          colorOnly,

  // ────── BEAUTY — Extras ──────
  'nail-polish':       beautyShade,
  'blush':             beautyShade,
  'concealer':         beautyShade,
  'lip-balm':          beautyVolume,
  'primer-makeup':     beautyVolume,
  'setting-spray':     beautyVolume,
  'compact-powder':    beautyShade,
  'mascara':           beautyShade,
  'bb-body-wash':      beautyVolume,
  'bb-soaps':          noVariants,
  'bb-body-lotion':    beautyVolume,
  'bta-hair-dryers':   colorOnly,
  'bta-straighteners': colorOnly,
  'bta-curling-irons': colorOnly,
  'bta-makeup-brushes': noVariants,
  'toothbrushes':      colorOnly,
  'mouthwash':         beautyVolume,
  'toothpaste-care':   groceryWeight,
  'ec-adult-diapers':  packCount,
  'ec-bp-monitors':    noVariants,
  'ph-hand-wash':      beautyVolume,
  'ph-sanitizers':     beautyVolume,

  // ────── GROCERY — Extras ──────
  'milk':              { sizeLabel: 'Volume', sizes: [
    { value: '200 ml', label: '200 ml' }, { value: '500 ml', label: '500 ml' },
    { value: '1 L', label: '1 L' }, { value: '2 L', label: '2 L' },
  ], hasColor: false },
  'cheese-dairy':      groceryWeight,
  'butter-ghee':       groceryWeight,
  'yoghurt-curd':      groceryWeight,
  'paneer':            groceryWeight,
  'whole-spices':      groceryWeight,
  'ground-spices':     groceryWeight,
  'masala-blends':     groceryWeight,
  'ketchup':           beautyVolume,
  'mayonnaise':        beautyVolume,
  'ice-cream':         groceryWeight,
  'brf-cereals':       groceryWeight,
  'brf-oats':          groceryWeight,
  'brf-muesli':        groceryWeight,
  'brf-granola':       groceryWeight,
  'gif-chocolates':    groceryWeight,
  'gif-olive-oil':     beautyVolume,
  'gif-dry-fruits':    groceryWeight,
  'ohf-grains':        groceryWeight,
  'ohf-honey':         groceryWeight,
  'ohf-health-bars':   groceryWeight,

  // ────── SPORTS — Extras ──────
  'ga-gloves':         clothingAlpha,
  'ga-yoga-mats':      colorOnly,
  'sg-cricket-bats':   noVariants,
  'sg-badminton':      noVariants,
  'sg-footballs':      colorOnly,
  'sg-tennis':         noVariants,
  'sg-sports-shoes':   mensFootwear,
  'boxing-gloves':     clothingAlpha,
  'swim-goggles':      colorOnly,
  'life-jackets':      clothingAlpha,

  // ────── TOYS — Extras ──────
  'btoy-soft-toys':    colorOnly,
  'kro-tricycles':     colorOnly,
  'kro-electric':      colorOnly,
  'kro-scooters':      colorOnly,

  // ────── AUTOMOTIVE — Extras ──────
  'sp-brake-pads':     noVariants,
  'sp-batteries':      noVariants,
  'lo-engine-oil':     beautyVolume,
  'lo-brake-fluid':    beautyVolume,

  // ────── BOOKS — Extras ──────
  'at-school':         bookFormat,
  'at-college':        bookFormat,
  'at-reference':      bookFormat,
  'cm-manga':          bookFormat,
  'cm-graphic':        bookFormat,
  'cep-upsc':          bookFormat,
  'cep-ssc':           bookFormat,
  'cep-bank':          bookFormat,
  'cep-jee':           bookFormat,
  'audiobooks-fiction': noVariants,
  'audiobooks-non-fiction': noVariants,
  'audiobooks-kids':   noVariants,

  // ────── PETS — Extras ──────
  'bird-feed':         groceryWeight,
  'fish-food':         groceryWeight,
  'bird-cages':        noVariants,
  'aquarium-tanks':    noVariants,

  // ────── GAMING — Extras ──────
  'vr-headsets':       colorOnly,
  'gaming-chairs':     colorOnly,
  'gaming-desks':      colorOnly,

  // ────── OFFICE SUPPLIES ──────
  'ball-pens':         colorOnly,
  'gel-pens':          colorOnly,
  'fountain-pens':     colorOnly,
  'markers-highlighters': colorOnly,
  'notebooks-journals': noVariants,
  'printer-paper':     packCount,
  'sticky-notes':      packCount,
  'pen-stands':        colorOnly,
  'staplers':          noVariants,
  'file-folders':      colorOnly,
  'inkjet-printers':   colorOnly,
  'laser-printers':    colorOnly,
  'acrylic-paints':    colorOnly,
  'watercolour-paints': colorOnly,
  'paint-brushes':     noVariants,
  'canvas-easels':     noVariants,
  'sketch-pads':       noVariants,

  // ────── GARDEN & OUTDOOR ──────
  'pruning-shears':    noVariants,
  'garden-hoses':      noVariants,
  'lawn-mowers':       colorOnly,
  'flower-seeds':      noVariants,
  'indoor-plants':     noVariants,
  'pots-planters':     colorOnly,
  'garden-chairs':     colorOnly,
  'garden-tables':     colorOnly,
  'hammocks':          colorOnly,
  'outdoor-umbrellas': colorOnly,
  'bbq-grills':        colorOnly,

  // ────── MUSICAL INSTRUMENTS ──────
  'acoustic-guitars':  colorOnly,
  'electric-guitars':  colorOnly,
  'ukuleles':          colorOnly,
  'violins':           colorOnly,
  'digital-pianos':    colorOnly,
  'synthesizers':      colorOnly,
  'midi-controllers':  colorOnly,
  'drum-kits':         colorOnly,
  'electronic-drums':  colorOnly,
  'flutes':            colorOnly,
  'harmonicas':        colorOnly,
  'dj-controllers':    colorOnly,
  'audio-interfaces':  colorOnly,
  'studio-microphones': colorOnly,
  'studio-monitors':   colorOnly,

  // ────── JEWELLERY & LUXURY ──────
  'fjgd-gold-necklaces': { sizeLabel: 'Length', sizes: [
    { value: '16 inch', label: '16 inch' }, { value: '18 inch', label: '18 inch' },
    { value: '20 inch', label: '20 inch' }, { value: '22 inch', label: '22 inch' },
    { value: '24 inch', label: '24 inch' },
  ], hasColor: true, colorLabel: 'Metal' },
  'fjgd-gold-rings':   ringSize,
  'fjgd-diamond-rings': ringSize,
  'fjgd-gold-earrings': colorOnly,
  'fjgd-gold-bangles': { sizeLabel: 'Size', sizes: [
    { value: '2.2', label: '2.2' }, { value: '2.4', label: '2.4' },
    { value: '2.6', label: '2.6' }, { value: '2.8', label: '2.8' },
  ], hasColor: true, colorLabel: 'Metal' },
  'fjgd-gold-chains':  { sizeLabel: 'Length', sizes: [
    { value: '16 inch', label: '16 inch' }, { value: '18 inch', label: '18 inch' },
    { value: '20 inch', label: '20 inch' }, { value: '22 inch', label: '22 inch' },
    { value: '24 inch', label: '24 inch' },
  ], hasColor: true, colorLabel: 'Metal' },
  'sj-rings':          ringSize,
  'sj-chains':         colorOnly,
  'sj-bracelets':      colorOnly,
  'sj-anklets':        colorOnly,
  'sj-earrings':       colorOnly,
  'fj-necklaces':      colorOnly,
  'fj-earrings':       colorOnly,
  'fj-bracelets':      colorOnly,
  'fj-rings':          ringSize,
  'fj-anklets':        colorOnly,
  'gj-gift-sets':      noVariants,
  'gj-charm':          colorOnly,
  'gj-pendants':       colorOnly,
  'gj-couple-rings':   ringSize,
  'lw-swiss':          colorOnly,
  'lw-automatic':      colorOnly,
  'lw-smartwatch':     colorOnly,
  'ps-diamonds':       noVariants,
  'ps-rubies':         noVariants,
  'ps-emeralds':       noVariants,
  'ps-sapphires':      noVariants,

  // ────── SOFTWARE & DIGITAL ──────
  'sl-antivirus':      noVariants,
  'sl-office':         noVariants,
  'sl-os':             noVariants,
  'sl-creative':       noVariants,
  'oc-programming':    noVariants,
  'oc-business':       noVariants,
  'oc-language':       noVariants,
  'oc-design':         noVariants,
  'ds-streaming':      noVariants,
  'ds-music':          noVariants,
  'ds-cloud':          noVariants,
  'gc-pc':             noVariants,
  'gc-console':        noVariants,
  'gc-currency':       noVariants,
  'gc-gift-cards':     noVariants,
  'dt-website':        noVariants,
  'dt-logo':           noVariants,
  'eb-fiction':        noVariants,
  'eb-non-fiction':    noVariants,
  'eb-academic':       noVariants,
  'eb-self-help':      noVariants,

  // ────── TRAVEL & LUGGAGE ──────
  'tl-cabin':          colorOnly,
  'tl-checkin':        colorOnly,
  'tl-sets':           colorOnly,
  'tl-hardshell':      colorOnly,
  'tl-softshell':      colorOnly,
  'tl-travel-bp':      colorOnly,
  'tl-hiking-bp':      colorOnly,
  'tl-laptop-bp':      colorOnly,
  'tl-antitheft-bp':   colorOnly,
  'tl-duffel':         colorOnly,
  'tl-gym':            colorOnly,
  'tl-garment':        colorOnly,
  'tl-passport':       colorOnly,
  'tl-neck-pillow':    colorOnly,
  'tl-tags':           colorOnly,
  'tl-organizers':     colorOnly,
  'tl-locks':          noVariants,
  'tl-packing-cubes':  colorOnly,

  // ────── HOME APPLIANCES ──────
  'ha-front-load':     applianceCapacity,
  'ha-top-load':       applianceCapacity,
  'ha-semi-auto':      applianceCapacity,
  'ha-washer-dryer':   applianceCapacity,
  'ha-single-door':    applianceCapacity,
  'ha-double-door':    applianceCapacity,
  'ha-side-by-side':   applianceCapacity,
  'ha-mini-fridge':    applianceCapacity,
  'ha-split-ac':       applianceCapacity,
  'ha-window-ac':      applianceCapacity,
  'ha-portable-ac':    applianceCapacity,
  'ha-air-coolers':    applianceCapacity,
  'ha-ro':             colorOnly,
  'ha-uv':             colorOnly,
  'ha-gravity':        colorOnly,
  'ha-ceiling-fans':   colorOnly,
  'ha-table-fans':     colorOnly,
  'ha-exhaust-fans':   colorOnly,
  'ha-tower-fans':     colorOnly,
  'ha-upright':        colorOnly,
  'ha-robot':          colorOnly,
  'ha-handheld':       colorOnly,
  'ha-wet-dry':        colorOnly,

  // ────── MEDICAL / SAFETY / INDUSTRIAL ──────
  'surgical-masks':    packCount,
  'disposable-gloves': packCount,
  'first-aid-kits':    noVariants,
  'safety-helmets':    colorOnly,
  'safety-goggles':    colorOnly,
  'lab-equipment':     noVariants,
};

// Subcategory-level fallbacks (if product type not found above)
const SUBCATEGORY_THEMES: Record<string, VariantTheme> = {
  // Fashion
  'men':                  clothingAlpha,
  'women':                clothingAlpha,
  'kids':                 kidsClothing,
  'footwear':             mensFootwear,
  'fashion-accessories':  freeSize,

  // Electronics
  'mobiles-accessories':  phoneStorage,
  'computers-laptops':    laptopStorage,
  'audio':                colorOnly,
  'cameras':              colorOnly,
  'smart-devices':        colorOnly,
  'networking':           noVariants,
  'tv-home-entertainment': screenSize,
  'computer-components':  noVariants,

  // Home & Kitchen
  'furniture':            colorOnly,
  'kitchen':              noVariants,
  'decor':                noVariants,
  'dining':               noVariants,
  'storage-organization': noVariants,
  'bedding-bath':         bedsheetSize,

  // Beauty
  'skincare':             beautyVolume,
  'haircare':             beautyVolume,
  'makeup':               beautyShade,
  'grooming':             colorOnly,
  'supplements':          groceryWeight,
  'fragrance':            beautyVolume,

  // Grocery
  'snacks':               groceryWeight,
  'beverages':            groceryWeight,
  'packaged-food':        groceryWeight,
  'household-essentials': noVariants,
  'staples':              groceryWeight,

  // Sports
  'fitness-equipment':    noVariants,
  'cycling':              colorOnly,
  'camping':              noVariants,
  'outdoor-gear':         noVariants,

  // Toys & Baby
  'toys-games':           noVariants,
  'baby-care':            noVariants,
  'school-supplies':      noVariants,

  // Automotive
  'car-accessories':      noVariants,
  'bike-accessories':     noVariants,
  'automotive-tools':     noVariants,

  // Books & Media
  'books':                bookFormat,
  'educational':          bookFormat,
  'movies':               noVariants,
  'music':                noVariants,

  // Gaming
  'consoles':             consoleStorage,
  'video-games':          noVariants,
  'gaming-accessories':   colorOnly,

  // Pets
  'pet-food':             groceryWeight,
  'pet-accessories':      noVariants,
  'pet-grooming':         noVariants,

  // Office Supplies
  'writing-instruments':  colorOnly,
  'paper-notebooks':      noVariants,
  'desk-accessories':     noVariants,
  'filing-organization':  noVariants,
  'printers-ink':         colorOnly,
  'art-craft-supplies':   colorOnly,

  // Garden
  'garden-tools':         noVariants,
  'plants-seeds':         noVariants,
  'outdoor-furniture':    colorOnly,
  'pest-control-garden':  noVariants,

  // Musical Instruments
  'string-instruments':   colorOnly,
  'keyboard-instruments': colorOnly,
  'percussion':           colorOnly,
  'wind-instruments':     colorOnly,
  'dj-recording':         colorOnly,

  // Jewellery
  'fine-jewellery-gold-diamond': ringSize,
  'silver-jewellery':     ringSize,
  'fashion-jewellery-cat': colorOnly,
  'gift-jewellery':       colorOnly,
  'luxury-watches':       colorOnly,
  'precious-stones':      noVariants,

  // Software
  'software-licenses':    noVariants,
  'online-courses':       noVariants,
  'digital-subscriptions': noVariants,
  'game-codes':           noVariants,
  'design-templates':     noVariants,
  'e-books':              noVariants,

  // Travel & Luggage
  'suitcases-trolley':    colorOnly,
  'travel-backpacks':     colorOnly,
  'duffel-gym-bags':      colorOnly,
  'travel-accessories-cat': colorOnly,

  // Home Appliances
  'washing-machines':     applianceCapacity,
  'refrigerators':        applianceCapacity,
  'air-conditioners':     applianceCapacity,
  'water-purifiers':      colorOnly,
  'fans-ventilation':     colorOnly,
  'vacuum-cleaners':      colorOnly,

  // Existing L1 missing sub fallbacks
  'printers-scanners':    colorOnly,
  'drones':               colorOnly,
  'tablets-cat':          laptopStorage,
  'mens-ethnic-wear':     clothingAlpha,
  'womens-ethnic-wear':   clothingAlpha,
  'sportswear':           clothingAlpha,
  'swimwear':             clothingAlpha,
  'bags-luggage':         colorOnly,
  'sunglasses-accessories': colorOnly,
  'dairy-eggs':           groceryWeight,
  'spices-masalas':       groceryWeight,
  'condiments-sauces':    groceryWeight,
  'frozen-foods':         groceryWeight,
  'baby-food':            groceryWeight,
  'breakfast-foods':      groceryWeight,
  'gourmet-imported-foods': groceryWeight,
  'organic-health-foods': groceryWeight,
  'bath-body':            beautyVolume,
  'beauty-tools-accessories': colorOnly,
  'oral-care':            noVariants,
  'elder-care':           noVariants,
  'personal-hygiene':     noVariants,
  'gym-accessories':      noVariants,
  'sports-gear':          noVariants,
  'team-sports':          noVariants,
  'yoga-meditation':      noVariants,
  'water-sports':         noVariants,
  'martial-arts':         noVariants,
  'baby-toys':            noVariants,
  'puzzles-games':        noVariants,
  'kids-ride-ons':        colorOnly,
  'school-learning-toys': noVariants,
  'bathroom-accessories': noVariants,
  'home-improvement':     noVariants,
  'laundry-ironing':      noVariants,
  'spare-parts':          noVariants,
  'lubricants-oils':      noVariants,
  'academic-textbooks':   bookFormat,
  'comics-manga':         bookFormat,
  'competitive-exam-prep': bookFormat,
  'audiobooks':           noVariants,
  'magazines-newspapers': noVariants,
  'bird-supplies':        noVariants,
  'fish-aquarium':        noVariants,
  'vr-ar':                colorOnly,
  'gaming-furniture':     colorOnly,
};

// Category-level (L1) fallbacks
const CATEGORY_THEMES: Record<string, VariantTheme> = {
  'electronics':      colorOnly,
  'fashion':          clothingAlpha,
  'home-kitchen':     noVariants,
  'beauty-health':    beautyVolume,
  'grocery':          groceryWeight,
  'sports-outdoors':  noVariants,
  'toys-baby':        noVariants,
  'automotive':       noVariants,
  'books-media':      bookFormat,
  'gaming':           noVariants,
  'pets':             noVariants,
  'medical-equipment':       noVariants,
  'safety-ppe':              noVariants,
  'industrial-lab-supplies': noVariants,
  'office-supplies-stationery': noVariants,
  'garden-outdoor-living':   noVariants,
  'musical-instruments':     colorOnly,
  'jewellery-luxury':        ringSize,
  'software-digital-products': noVariants,
  'travel-luggage':          colorOnly,
  'home-appliances':         applianceCapacity,
};

/**
 * Generic fallback — custom text input, color picker enabled.
 * Used when no mapping exists at any level.
 */
export const FALLBACK_THEME: VariantTheme = {
  sizeLabel: 'Size',
  sizes: FREE_SIZE,
  allowCustomSize: true,
  hasColor: true,
};

// ── DB-driven size preset overrides ─────────────────────────────────────────
// The size lists above are the FALLBACK. At runtime the app may load rows from
// the `variant_size_presets` table (keyed by the names below) and override the
// matching list in place. Because every VariantTheme references these same
// array objects, an in-place splice updates all themes automatically.

export const SIZE_PRESET_REGISTRY: Record<string, SizeOption[]> = {
  APPAREL_ALPHA,
  INNERWEAR_EXTENDED,
  WAIST_SIZES,
  MENS_SHOE,
  WOMENS_SHOE,
  KIDS_AGE,
  KIDS_SHOE,
  PHONE_STORAGE,
  LAPTOP_STORAGE,
  SCREEN_SIZES,
  BEAUTY_VOLUME,
  GROCERY_WEIGHT,
  RING_SIZES,
  BOOK_FORMAT,
  CONSOLE_STORAGE,
  BED_SIZES,
  BEDSHEET_SIZES,
  TOWEL_SIZES,
  BRA_SIZES,
  STOCKING_SIZES,
  FREE_SIZE,
  PACK_COUNT,
  APPLIANCE_CAPACITY,
};

let presetVersion = 0;
const presetListeners = new Set<() => void>();

/** Monotonic counter bumped whenever DB overrides are applied. */
export function getSizePresetVersion(): number {
  return presetVersion;
}

/** Subscribe to preset override changes (for React useSyncExternalStore). */
export function subscribeSizePresets(listener: () => void): () => void {
  presetListeners.add(listener);
  return () => {
    presetListeners.delete(listener);
  };
}

/**
 * Override predefined size lists with DB-provided values. Only keys present in
 * SIZE_PRESET_REGISTRY and with a non-empty option list are applied; everything
 * else keeps its hardcoded default, so a missing/empty/failed fetch is safe.
 */
export function applySizePresetOverrides(
  overrides: Record<string, SizeOption[]>,
): void {
  let changed = false;
  for (const [key, options] of Object.entries(overrides)) {
    const target = SIZE_PRESET_REGISTRY[key];
    if (!target || !Array.isArray(options) || options.length === 0) continue;
    target.splice(0, target.length, ...options);
    changed = true;
  }
  if (changed) {
    presetVersion += 1;
    presetListeners.forEach((listener) => listener());
  }
}

/**
 * Resolve the variant theme for a product, falling back through the
 * category hierarchy: productType → subCategory → category → generic.
 */
export function resolveVariantTheme(
  productTypeSlug?: string,
  subCategorySlug?: string,
  categorySlug?: string,
): VariantTheme {
  if (productTypeSlug && PRODUCT_TYPE_THEMES[productTypeSlug]) {
    return PRODUCT_TYPE_THEMES[productTypeSlug];
  }
  if (subCategorySlug && SUBCATEGORY_THEMES[subCategorySlug]) {
    return SUBCATEGORY_THEMES[subCategorySlug];
  }
  if (categorySlug && CATEGORY_THEMES[categorySlug]) {
    return CATEGORY_THEMES[categorySlug];
  }
  return FALLBACK_THEME;
}
