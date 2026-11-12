import { jsPDF } from 'jspdf';
import { saveAndShareFile } from '../mobile/externalLinks';
import { isNativePlatform } from '../mobile/nativePlatform';
import { COMPANY_ADDRESS_LINES } from '../constants/companyContact';

export interface InvoiceLineItem {
  name: string;
  sku?: string;
  hsn_code?: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  orderId: string;
  orderDate: string;
  deliveryDate?: string;
  paymentMethod?: string;
  sellerName?: string;
  sellerAddress?: string;
  sellerContact?: string;
  buyerName?: string;
  buyerAddress?: string;
  buyerPhone?: string;
  items: InvoiceLineItem[];
  currency: string;
  totalPaid: number;
  platformFeeRate?: number;
  shippingCharge?: number;
  offerDiscount?: number;
  summaryMode?: 'customer' | 'seller';
}

const logoPath = '/images/logo/invoice-logo.png';

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch(logoPath, { cache: 'no-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function buildInvoiceDoc(
  data: InvoicePdfData,
  formatPrice: (value: number, currency: string) => string,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerHeight = 92;
  const footerHeight = 86;
  const left = 30;
  const right = pageWidth - 30;
  const contentTop = headerHeight + 24;
  const contentBottom = pageHeight - footerHeight - 20;
  const platformFeeRate = data.platformFeeRate ?? 0.03;
  const summaryMode = data.summaryMode || 'customer';
  let y = contentTop;

  // jsPDF's built-in helvetica uses WinAnsi encoding, which supports these
  // currency symbols natively. Anything outside this set (e.g. ₹) must fall
  // back to the ISO code so it doesn't render as a blank/garbled glyph.
  const SYMBOL_MAP: Record<string, string> = {
    GBP: '\u00A3', // £
    EUR: '\u20AC', // €
    USD: '$',
    CAD: '$',
    AUD: '$',
    JPY: '\u00A5', // ¥
    CNY: '\u00A5', // ¥
  };

  const formatAmountForPdf = (value: number, currency: string): string => {
    const numeric = Number.isFinite(value) ? value : 0;
    const code = (currency || 'INR').toUpperCase();
    const amount = numeric.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const symbol = SYMBOL_MAP[code];
    if (symbol) return `${symbol}${amount}`;
    // Use formatPrice if it produced something ASCII-safe; otherwise fall back to the code.
    const fromFormatter = formatPrice(numeric, code).replace(/[^\x20-\x7E]/g, '').trim();
    if (fromFormatter && !/[&]/.test(fromFormatter) && fromFormatter.includes(code)) return fromFormatter;
    return `${code} ${amount}`;
  };

  const logoDataUrl = await loadLogoDataUrl();

  const drawHeader = () => {
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', left, 20, 120, 53);
    } else {
      doc.setTextColor(20, 24, 36);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.text('BZEAD', left, 55);
    }

    // Company block — right-aligned, dark text
    doc.setTextColor(20, 24, 36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('BZEAD MARKETPLACE', right, 32, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(90, 96, 110);
    doc.text('POWERED BY BEAUZEAD INDIA', right, 48, { align: 'right' });
    doc.text(COMPANY_ADDRESS_LINES[0], right, 62, { align: 'right' });
    doc.text(COMPANY_ADDRESS_LINES[1], right, 76, { align: 'right' });

    // Separator line under header
    doc.setDrawColor(220, 223, 229);
    doc.setLineWidth(1);
    doc.line(left, headerHeight - 4, right, headerHeight - 4);
    doc.setTextColor(20, 24, 36);
  };

  const drawFooter = () => {
    // Separator line above footer
    doc.setDrawColor(220, 223, 229);
    doc.setLineWidth(1);
    doc.line(left, pageHeight - footerHeight + 4, right, pageHeight - footerHeight + 4);

    doc.setTextColor(90, 96, 110);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.7);
    const footerText =
      'BZEAD is an online marketplace platform operated by BEAUZEAD INDIA, a limited company registered in India. Products listed on this platform are sold and fulfilled by independent sellers. The respective seller is responsible for product taxes, compliance, and shipping.';
    const footerMaxWidth = pageWidth - 60;
    doc.text(footerText, left, pageHeight - footerHeight + 24, { align: 'justify', maxWidth: footerMaxWidth });
    doc.setTextColor(20, 24, 36);
  };

  const ensureSpace = (needed: number) => {
    if (y + needed <= contentBottom) return;
    drawFooter();
    doc.addPage();
    drawHeader();
    y = contentTop;
  };

  const write = (text: string, x: number, options?: { bold?: boolean; size?: number; color?: [number, number, number] }) => {
    doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
    doc.setFontSize(options?.size || 10.5);
    if (options?.color) doc.setTextColor(...options.color);
    doc.text(text, x, y);
    doc.setTextColor(20, 24, 36);
    y += 14;
  };

  const writeWrapped = (
    text: string,
    x: number,
    topY: number,
    maxWidth: number,
    options?: { bold?: boolean; size?: number; lineHeight?: number },
  ): number => {
    doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
    doc.setFontSize(options?.size || 10);
    const lineHeight = options?.lineHeight || 13;
    const lines = doc.splitTextToSize(String(text || ''), maxWidth) as string[];
    let cursor = topY;
    lines.forEach((line) => {
      doc.text(line, x, cursor);
      cursor += lineHeight;
    });
    return cursor;
  };

  drawHeader();

  ensureSpace(90);
  write('Order Information', left, { bold: true, size: 14 });
  write(`Invoice No: ${data.invoiceNumber}`, left);
  write(`Order ID: ${data.orderId}`, left);
  write(`Order Date: ${data.orderDate || 'Not available'}`, left);
  write(`Expected Delivery: ${data.deliveryDate || 'Not available'}`, left);
  write(`Payment Method: ${data.paymentMethod || 'Not available'}`, left);

  ensureSpace(110);
  const boxTop = y + 6;
  const boxGap = 16;
  const boxWidth = (pageWidth - left * 2 - boxGap) / 2;
  const boxHeight = 118;

  doc.setDrawColor(220, 223, 229);
  doc.rect(left, boxTop, boxWidth, boxHeight);
  doc.rect(left + boxWidth + boxGap, boxTop, boxWidth, boxHeight);

  const leftColX = left + 10;
  const rightColX = left + boxWidth + boxGap + 10;
  const textMaxWidth = boxWidth - 20;

  let leftY = boxTop + 18;
  leftY = writeWrapped('Sold By', leftColX, leftY, textMaxWidth, { bold: true, size: 11, lineHeight: 14 });
  leftY = writeWrapped(data.sellerName || 'Not available', leftColX, leftY, textMaxWidth);
  leftY = writeWrapped(data.sellerAddress || 'Not available', leftColX, leftY, textMaxWidth, { size: 9.5 });
  writeWrapped(data.sellerContact || 'Not available', leftColX, leftY, textMaxWidth, { size: 9.5 });

  let rightY = boxTop + 18;
  rightY = writeWrapped('Bill To', rightColX, rightY, textMaxWidth, { bold: true, size: 11, lineHeight: 14 });
  rightY = writeWrapped(data.buyerName || 'Not available', rightColX, rightY, textMaxWidth);
  rightY = writeWrapped(data.buyerAddress || 'Not available', rightColX, rightY, textMaxWidth, { size: 9.5 });
  writeWrapped(data.buyerPhone || 'Not available', rightColX, rightY, textMaxWidth, { size: 9.5 });

  y = boxTop + boxHeight + 22;
  ensureSpace(34);
  const colProduct = left;
  const colSku = left + 170;
  const colHsn = left + 250;
  const colQty = left + 310;
  const colPrice = left + 360;
  const colTotal = left + 450;
  const productTextMaxWidth = 160;

  doc.setFillColor(241, 243, 246);
  doc.rect(left, y, pageWidth - left * 2, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Product', colProduct + 8, y + 16);
  doc.text('SKU', colSku + 8, y + 16);
  doc.text('HSN', colHsn + 8, y + 16);
  doc.text('Qty', colQty + 8, y + 16);
  doc.text('Price', colPrice + 8, y + 16);
  doc.text('Total', colTotal + 8, y + 16);
  y += 24;

  let subtotal = 0;
  data.items.forEach((item, index) => {
    const productLines = doc.splitTextToSize(`${index + 1}. ${item.name || 'Item'}`, productTextMaxWidth) as string[];
    const rowHeight = Math.max(22, productLines.length * 12 + 8);
    ensureSpace(rowHeight + 2);
    subtotal += item.total;

    doc.setDrawColor(234, 236, 240);
    doc.line(left, y + rowHeight, pageWidth - left, y + rowHeight);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.8);
    doc.text(productLines, colProduct + 8, y + 14);
    doc.text(item.sku || '-', colSku + 8, y + 15);
    doc.text(item.hsn_code || '-', colHsn + 8, y + 15);
    doc.text(String(item.qty), colQty + 8, y + 15);
    doc.text(formatAmountForPdf(item.unitPrice, data.currency), colPrice + 8, y + 15);
    doc.text(formatAmountForPdf(item.total, data.currency), colTotal + 8, y + 15);
    y += rowHeight;
  });

  const shippingCharge = data.shippingCharge ?? 0;
  const offerDiscount = data.offerDiscount ?? 0;
  const payableBeforeCommission = subtotal - offerDiscount + shippingCharge;
  const platformFee = Math.round(payableBeforeCommission * platformFeeRate * 100) / 100;
  const totalPaid = Number(data.totalPaid || payableBeforeCommission + platformFee);

  const summaryRows: { label: string; value: number; bold?: boolean }[] = [
    { label: 'Product Subtotal', value: subtotal },
  ];

  if (summaryMode === 'customer') {
    summaryRows.push({ label: 'Platform Commission', value: platformFee });
    if (shippingCharge > 0) summaryRows.push({ label: 'Shipping Charge', value: shippingCharge });
    if (offerDiscount > 0) summaryRows.push({ label: 'Discount', value: -offerDiscount });
    summaryRows.push({ label: 'Total Paid', value: totalPaid, bold: true });
  } else {
    summaryRows.push({ label: 'Seller Total', value: subtotal, bold: true });
  }

  ensureSpace(summaryRows.length * 24 + 30);
  const summaryWidth = 280;
  const summaryX = right - summaryWidth;
  const rowH = 24;
  const summaryTop = y + 14;

  doc.setDrawColor(220, 223, 229);
  doc.rect(summaryX, summaryTop, summaryWidth, rowH * summaryRows.length);

  summaryRows.forEach((row, i) => {
    if (i > 0) doc.line(summaryX, summaryTop + rowH * i, summaryX + summaryWidth, summaryTop + rowH * i);
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(row.bold ? 11 : 10);
    doc.text(row.label, summaryX + 10, summaryTop + rowH * i + 16);
    doc.text(formatAmountForPdf(row.value, data.currency), summaryX + summaryWidth - 10, summaryTop + rowH * i + 16, { align: 'right' });
  });

  drawFooter();

  return doc;
}

export async function generateInvoicePdf(
  data: InvoicePdfData,
  formatPrice: (value: number, currency: string) => string,
): Promise<void> {
  const doc = await buildInvoiceDoc(data, formatPrice);
  const fileName = `${data.invoiceNumber}.pdf`;
  if (isNativePlatform) {
    // On Capacitor (Android/iOS) the WebView ignores <a download>, so route
    // through Filesystem + Share. On web, use the normal blob-download path.
    const blob = doc.output('blob');
    await saveAndShareFile(fileName, blob, 'application/pdf');
  } else {
    doc.save(fileName);
  }
}

/**
 * Build the invoice PDF and return it as base64 (no filename prefix) plus a
 * suggested filename. Used to attach the invoice to transactional emails.
 */
export async function generateInvoicePdfBase64(
  data: InvoicePdfData,
  formatPrice: (value: number, currency: string) => string,
): Promise<{ base64: string; filename: string }> {
  const doc = await buildInvoiceDoc(data, formatPrice);
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.includes(',') ? dataUri.slice(dataUri.indexOf(',') + 1) : dataUri;
  return { base64, filename: `${data.invoiceNumber}.pdf` };
}
