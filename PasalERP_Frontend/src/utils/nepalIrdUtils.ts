/**
 * Nepal IRD Regulations & Utility Functions
 * Supports:
 * - 9-digit PAN validation as mandated by Inland Revenue Department Nepal
 * - South-Asian numbering comma format (e.g., 1,25,000.00)
 * - Amount to Words in Nepalese Rupee (NPR)
 * - Bikram Sambat (B.S.) Date handling
 * - Fiscal Year calculation (e.g. 2081/82)
 */
import { adToBs } from '@sbmdkl/nepali-date-converter';
export function validateNepalPan(pan: string): { isValid: boolean; message: string } {
  const cleanPan = pan.trim();
  if (!cleanPan) {
    return { isValid: false, message: 'PAN number is required' };
  }
  if (!/^\d{9}$/.test(cleanPan)) {
    return { isValid: false, message: 'Nepal PAN/VAT must be exactly 9 digits' };
  }
  return { isValid: true, message: 'Valid 9-digit Nepal PAN' };
}

export function formatNPR(amount: number): string {
  if (isNaN(amount)) return 'Rs. 0.00';
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const parts = absAmount.toFixed(2).split('.');
  let integerPart = parts[0];
  const decimalPart = parts[1];

  // South Asian formatting: last 3 digits, then every 2 digits
  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherNumbers = integerPart.substring(0, integerPart.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

  return `${isNegative ? '-' : ''}Rs. ${formattedInteger}.${decimalPart}`;
}

export function formatNPRSimple(amount: number): string {
  return formatNPR(amount).replace('Rs. ', 'NPR ');
}

// Convert numbers into Words (Nepali / Indian format: Hundred, Thousand, Lakh, Crore)
export function amountToWordsNPR(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Zero Rupees Only';

  const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = [
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
    'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n: number): string {
    if (n === 0) return '';
    if (n < 10) return singleDigits[n];
    if (n < 20) return teens[n - 10];
    const unit = n % 10;
    const ten = Math.floor(n / 10);
    return tens[ten] + (unit > 0 ? ' ' + singleDigits[unit] : '');
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundred > 0) {
      res += singleDigits[hundred] + ' Hundred';
      if (rest > 0) res += ' and ';
    }
    if (rest > 0) {
      res += convertTwoDigits(rest);
    }
    return res;
  }

  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const rupeePart = Math.floor(rounded);
  const paisaPart = Math.round((rounded - rupeePart) * 100);

  if (rupeePart === 0 && paisaPart === 0) return 'Zero Rupees Only';

  let result = '';

  // In South Asian system: Crore (1,00,00,000), Lakh (1,00,000), Thousand (1,000), Hundreds
  const crore = Math.floor(rupeePart / 10000000);
  let remainder = rupeePart % 10000000;

  const lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;

  const thousand = Math.floor(remainder / 1000);
  remainder = remainder % 1000;

  const hundreds = remainder;

  if (crore > 0) {
    result += convertTwoDigits(crore) + ' Crore ';
  }
  if (lakh > 0) {
    result += convertTwoDigits(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    result += convertTwoDigits(thousand) + ' Thousand ';
  }
  if (hundreds > 0) {
    result += convertThreeDigits(hundreds) + ' ';
  }

  result = result.trim() + ' Rupees';

  if (paisaPart > 0) {
    result += ' and ' + convertTwoDigits(paisaPart) + ' Paisa';
  }

  return result + ' Only';
}
/**
 * Nepal BS / AD Date Utilities
 *
 * Nepal fiscal year:
 * Shrawan 1 -> Ashad 31
 *
 * Example:
 * AD 2026-09-07
 * = BS 2083-05-22
 * = Fiscal Year 2083/84
 */

function getTodayAdDate(): string {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getCurrentAdDate(): string {
  return getTodayAdDate();
}

export function getCurrentBsDate(): string {
  const adDate = getTodayAdDate();

  try {
    const bsDate = adToBs(adDate);

    return bsDate;
  } catch (error) {
    console.error('Failed to convert AD date to BS:', error);

    return '';
  }
}

export function getCurrentFiscalYear(): string {
  const bsDate = getCurrentBsDate();

  if (!bsDate) {
    return '';
  }

  const [yearString, monthString] = bsDate.split('-');

  const bsYear = Number(yearString);
  const bsMonth = Number(monthString);

  if (!Number.isFinite(bsYear) || !Number.isFinite(bsMonth)) {
    return '';
  }

  // Nepal fiscal year starts from Shrawan (month 4).
  //
  // Baisakh 1 - Ashad 31  => previous FY
  // Shrawan 1 - Chaitra 31 => current BS year/current FY
  if (bsMonth >= 4) {
    return `${bsYear}/${String(bsYear + 1).slice(-2)}`;
  }

  return `${bsYear - 1}/${String(bsYear).slice(-2)}`;
}

export const NEPALI_MONTHS = [
  'Baisakh',
  'Jestha',
  'Ashad',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
];
