import type {
  Account,
  JournalEntry,
  JournalLine,
  PurchaseBill,
  SalesInvoice
} from '../types.js';

import { nearlyEqual, round2 } from './money.js';

import type {
  AccountDetermination
} from '../services/accountDeterminationService.js';


/**
 * Update account balances from journal lines.
 *
 * Assets / Expenses:
 *   Debit  = increase
 *   Credit = decrease
 *
 * Liabilities / Equity / Revenue:
 *   Credit = increase
 *   Debit  = decrease
 */
export function updateAccountBalances(
  accounts: Account[],
  lines: JournalLine[]
): Account[] {

  return accounts.map(acc => {

    const matches = lines.filter(
      line => line.accountCode === acc.code
    );

    if (!matches.length) {
      return acc;
    }

    const delta = matches.reduce((sum, line) => {

      return sum +
        (
          acc.category === 'asset' ||
          acc.category === 'expense'

            ? Number(line.debit) - Number(line.credit)

            : Number(line.credit) - Number(line.debit)
        );

    }, 0);

    return {
      ...acc,
      balance: round2(
        Number(acc.balance) + delta
      )
    };
  });
}


/**
 * ------------------------------------------------------------
 * SALES JOURNAL
 * ------------------------------------------------------------
 *
 * IMPORTANT:
 *
 * This function MUST NOT know fixed account codes such as:
 *
 * 1010
 * 1020
 * 1030
 * 1040
 * 2010
 * 2020
 * 4010
 * 5010
 *
 * All account codes come from Account Determination.
 */
export function buildSalesJournal(
  invoice: SalesInvoice,
  accounts: AccountDetermination
): {
  referenceType: JournalEntry['referenceType'];
  referenceNo: string;
  narration: string;
  lines: JournalLine[];
} {

  /*
   * Cash / Bank transaction:
   *
   * Cash
   * Bank / Fonepay QR
   * Card
   *
   * goes to Cash & Bank.
   *
   * Credit transaction goes to Accounts Receivable.
   */
  const isCashOrBank =
    invoice.paymentMode === 'Cash' ||
    invoice.paymentMode === 'Bank / Fonepay QR' ||
    invoice.paymentMode === 'Card';

  const counterAccount = isCashOrBank
    ? accounts.cashBank
    : accounts.accountsReceivable;


  const counterCode = counterAccount.code;
  const counterName = counterAccount.name;


  const type =
    invoice.transactionType ?? 'tax_invoice';


  const revenue = round2(
    Number(invoice.taxableAmount) +
    Number(invoice.nonTaxableAmount)
  );


  const vatAmount = round2(
    Number(invoice.vatAmount)
  );


  const totalCogs = round2(
    Math.abs(Number(invoice.totalCogs))
  );


  let lines: JournalLine[];

  let referenceType: JournalEntry['referenceType'];

  let narration: string;


  /*
   * ----------------------------------------------------------
   * SALES RETURN
   * ----------------------------------------------------------
   *
   * Dr Sales Revenue
   * Dr Output VAT
   * Cr Customer / Cash
   *
   * Dr Inventory
   * Cr COGS
   */
  if (type === 'sales_return') {

    referenceType = 'Sales Return';

    narration =
      `बिक्री फिर्ता: ${invoice.customerName}, ` +
      `सम्बन्धित बीजक ${invoice.refInvoiceNo ?? invoice.invoiceNo}, ` +
      `कारण: ${invoice.reason ?? 'बिक्री फिर्ता'}।`;

    lines = [

      {
        accountCode: accounts.salesRevenue.code,
        accountName: accounts.salesRevenue.name,
        debit: revenue,
        credit: 0,
        description:
          `बिक्री फिर्ता ${invoice.invoiceNo}`
      },

      {
        accountCode: accounts.outputVat.code,
        accountName: accounts.outputVat.name,
        debit: vatAmount,
        credit: 0,
        description:
          `Output VAT reversal ${invoice.invoiceNo}`
      },

      {
        accountCode: counterCode,
        accountName: counterName,
        debit: 0,
        credit: Number(invoice.grandTotal),
        partnerId: invoice.customerId,
        partnerName: invoice.customerName,
        description:
          `ग्राहक समायोजन ${invoice.invoiceNo}`
      },

      {
        accountCode: accounts.inventory.code,
        accountName: accounts.inventory.name,
        debit: totalCogs,
        credit: 0,
        description:
          `Returned stock restocked at FIFO cost`
      },

      {
        accountCode: accounts.cogs.code,
        accountName: accounts.cogs.name,
        debit: 0,
        credit: totalCogs,
        description:
          `COGS reversal ${invoice.invoiceNo}`
      }
    ];


  /*
   * ----------------------------------------------------------
   * SALES DEBIT NOTE
   * ----------------------------------------------------------
   *
   * Dr Customer / Cash
   * Cr Output VAT
   * Cr Sales Revenue
   */
  } else if (type === 'debit_note') {

    referenceType = 'Sales Debit Note';

    narration =
      `बिक्री डेबिट नोट ${invoice.invoiceNo}: ` +
      `${invoice.reason ?? 'दर अन्तर'}।`;

    lines = [

      {
        accountCode: counterCode,
        accountName: counterName,
        debit: Number(invoice.grandTotal),
        credit: 0,
        partnerId: invoice.customerId,
        partnerName: invoice.customerName
      },

      {
        accountCode: accounts.outputVat.code,
        accountName: accounts.outputVat.name,
        debit: 0,
        credit: vatAmount
      },

      {
        accountCode: accounts.salesRevenue.code,
        accountName: accounts.salesRevenue.name,
        debit: 0,
        credit: revenue
      }
    ];


  /*
   * ----------------------------------------------------------
   * SALES CREDIT NOTE
   * ----------------------------------------------------------
   *
   * Dr Sales Revenue
   * Dr Output VAT
   * Cr Customer / Cash
   */
  } else if (type === 'credit_note') {

    referenceType = 'Sales Credit Note';

    narration =
      `बिक्री क्रेडिट नोट ${invoice.invoiceNo}: ` +
      `${invoice.reason ?? 'व्यापारिक छुट/सहुलियत'}।`;

    lines = [

      {
        accountCode: accounts.salesRevenue.code,
        accountName: accounts.salesRevenue.name,
        debit: revenue,
        credit: 0
      },

      {
        accountCode: accounts.outputVat.code,
        accountName: accounts.outputVat.name,
        debit: vatAmount,
        credit: 0
      },

      {
        accountCode: counterCode,
        accountName: counterName,
        debit: 0,
        credit: Number(invoice.grandTotal),
        partnerId: invoice.customerId,
        partnerName: invoice.customerName
      }
    ];


  /*
   * ----------------------------------------------------------
   * NORMAL SALES INVOICE
   * ----------------------------------------------------------
   *
   * Cash sale:
   *
   * Dr Cash / Bank
   * Dr COGS
   * Cr Output VAT
   * Cr Sales Revenue
   * Cr Inventory
   *
   * Credit sale:
   *
   * Dr Accounts Receivable
   * Dr COGS
   * Cr Output VAT
   * Cr Sales Revenue
   * Cr Inventory
   */
  } else {

    referenceType = 'Sales Invoice';

    narration =
      `तयारी पोशाक बिक्री कर बीजक ${invoice.invoiceNo}: ` +
      `${invoice.customerName}।`;

    lines = [

      {
        accountCode: counterCode,
        accountName: counterName,
        debit: Number(invoice.grandTotal),
        credit: 0,
        partnerId: invoice.customerId,
        partnerName: invoice.customerName
      },

      {
        accountCode: accounts.cogs.code,
        accountName: accounts.cogs.name,
        debit: totalCogs,
        credit: 0
      },

      {
        accountCode: accounts.outputVat.code,
        accountName: accounts.outputVat.name,
        debit: 0,
        credit: vatAmount
      },

      {
        accountCode: accounts.salesRevenue.code,
        accountName: accounts.salesRevenue.name,
        debit: 0,
        credit: revenue
      },

      {
        accountCode: accounts.inventory.code,
        accountName: accounts.inventory.name,
        debit: 0,
        credit: totalCogs
      }
    ];
  }


  return {
    referenceType,
    referenceNo: invoice.invoiceNo,
    narration,
    lines
  };
}


/**
 * ------------------------------------------------------------
 * PURCHASE JOURNAL
 * ------------------------------------------------------------
 *
 * Purchase account treatment depends on:
 *
 * VAT Registered:
 *
 *   Dr Inventory              NET
 *   Dr Input VAT              VAT
 *   Cr Accounts Payable      TOTAL
 *
 *
 * PAN Registered:
 *
 * Supplier gives VAT bill:
 *
 *   Dr Inventory              NET + VAT
 *   Cr Accounts Payable      TOTAL
 *
 *
 * PAN Registered:
 *
 * Supplier does NOT give VAT bill:
 *
 *   Dr Inventory              NET
 *   Cr Accounts Payable      NET
 *
 * Therefore Input VAT is NOT posted for PAN businesses.
 */
export function buildPurchaseJournal(
  bill: PurchaseBill,
  inventoryCost: number,
  accounts: AccountDetermination
): {
  referenceType: JournalEntry['referenceType'];
  referenceNo: string;
  narration: string;
  lines: JournalLine[];
} {
  const isCashOrBank =
    bill.paymentMode === 'Cash' ||
    bill.paymentMode === 'Bank Transfer';

  const counterAccount = isCashOrBank
    ? accounts.cashBank
    : accounts.accountsPayable;

  const counterCode = counterAccount.code;
  const counterName = counterAccount.name;
  const type = bill.transactionType ?? 'purchase_invoice';

  const taxableAmount = round2(Number(bill.taxableAmount));
  const nonTaxableAmount = round2(Number(bill.nonTaxableAmount));
  const vatAmount = round2(Number(bill.vatAmount));
  const inventoryAdjustment = round2(Math.abs(Number(inventoryCost)));

  /*
   * Normal purchase inventory value.
   * For PAN + supplier VAT bill, VAT is capitalized into inventory.
   */
  const purchaseCost = bill.isCapitalizedVat
    ? round2(taxableAmount + nonTaxableAmount + vatAmount)
    : round2(taxableAmount + nonTaxableAmount);

  let lines: JournalLine[];
  let referenceType: JournalEntry['referenceType'];
  let narration: string;

  if (type === 'purchase_return') {
    referenceType = 'Purchase Return';

    narration =
      `खरिद फिर्ता ${bill.billNo}: ` +
      `${bill.vendorName}, ` +
      `कारण: ${bill.reason ?? 'खरिद फिर्ता'}।`;

    lines = [
      {
        accountCode: counterCode,
        accountName: counterName,
        debit: Number(bill.grandTotal),
        credit: 0,
        partnerId: bill.vendorId,
        partnerName: bill.vendorName
      },
      ...(bill.isCapitalizedVat
        ? []
        : vatAmount > 0
          ? [{
              accountCode: accounts.inputVat.code,
              accountName: accounts.inputVat.name,
              debit: 0,
              credit: vatAmount,
              description: `Input VAT reversal ${bill.billNo}`
            }]
          : []),
      {
        accountCode: accounts.inventory.code,
        accountName: accounts.inventory.name,
        debit: 0,
        credit: round2(inventoryCost),
        description: `Returned inventory ${bill.billNo}`
      }
    ];

  } else if (type === 'debit_note') {
    /*
     * PURCHASE DEBIT NOTE
     * -------------------
     * Supplier is being debited for a reduction/claim.
     * No physical stock movement occurs; transactionService adjusts the
     * remaining FIFO layer value only.
     *
     * VAT registered:
     *   Dr Accounts Payable       NET + VAT
     *   Cr Inventory              NET
     *   Cr Input VAT              VAT
     *
     * PAN + supplier VAT bill:
     *   Dr Accounts Payable       NET + VAT
     *   Cr Inventory              NET + VAT
     */
    referenceType = 'Purchase Debit Note';

    narration =
      `खरिद डेबिट नोट ${bill.billNo}: ` +
      `${bill.reason ?? 'दर फरक वा क्षतिपूर्ति दाबी'}।`;

    lines = [
      {
        accountCode: counterCode,
        accountName: counterName,
        debit: Number(bill.grandTotal),
        credit: 0,
        partnerId: bill.vendorId,
        partnerName: bill.vendorName,
        description: `Supplier debit adjustment ${bill.billNo}`
      },
      ...(bill.isCapitalizedVat || vatAmount <= 0
        ? []
        : [{
            accountCode: accounts.inputVat.code,
            accountName: accounts.inputVat.name,
            debit: 0,
            credit: vatAmount,
            description: `Input VAT reversal ${bill.billNo}`
          }]),
      {
        accountCode: accounts.inventory.code,
        accountName: accounts.inventory.name,
        debit: 0,
        credit: inventoryAdjustment,
        description: `Inventory value reduction ${bill.billNo}`
      }
    ];

  } else if (type === 'credit_note') {
    /*
     * PURCHASE CREDIT NOTE
     * --------------------
     * Supplier grants an additional amount/rebate to the buyer.
     * No physical stock movement occurs; transactionService increases the
     * remaining FIFO layer value only.
     *
     * VAT registered:
     *   Dr Inventory              NET
     *   Dr Input VAT              VAT
     *   Cr Accounts Payable       NET + VAT
     *
     * PAN + supplier VAT bill:
     *   Dr Inventory              NET + VAT
     *   Cr Accounts Payable       NET + VAT
     */
    referenceType = 'Purchase Credit Note';

    narration =
      `खरिद क्रेडिट नोट ${bill.billNo}: ` +
      `${bill.reason ?? 'व्यापारिक रिबेट वा भोल्युम छुट'}।`;

    lines = [
      {
        accountCode: accounts.inventory.code,
        accountName: accounts.inventory.name,
        debit: inventoryAdjustment,
        credit: 0,
        description: `Inventory value increase ${bill.billNo}`
      },
      ...(bill.isCapitalizedVat || vatAmount <= 0
        ? []
        : [{
            accountCode: accounts.inputVat.code,
            accountName: accounts.inputVat.name,
            debit: vatAmount,
            credit: 0,
            description: `Input VAT adjustment ${bill.billNo}`
          }]),
      {
        accountCode: counterCode,
        accountName: counterName,
        debit: 0,
        credit: Number(bill.grandTotal),
        partnerId: bill.vendorId,
        partnerName: bill.vendorName,
        description: `Supplier credit adjustment ${bill.billNo}`
      }
    ];

  } else {
    referenceType = 'Purchase Bill';

    narration =
      `आपूर्तिकर्ताबाट खरिद ${bill.billNo}: ` +
      `${bill.vendorName}, ` +
      `supplier bill ${bill.supplierBillNo}।`;

    lines = [
      {
        accountCode: accounts.inventory.code,
        accountName: accounts.inventory.name,
        debit: purchaseCost,
        credit: 0
      },
      ...(bill.isCapitalizedVat || vatAmount <= 0
        ? []
        : [{
            accountCode: accounts.inputVat.code,
            accountName: accounts.inputVat.name,
            debit: vatAmount,
            credit: 0,
            description: `Input VAT ${bill.billNo}`
          }]),
      {
        accountCode: counterCode,
        accountName: counterName,
        debit: 0,
        credit: Number(bill.grandTotal),
        partnerId: bill.vendorId,
        partnerName: bill.vendorName
      }
    ];
  }

  return {
    referenceType,
    referenceNo: bill.billNo,
    narration,
    lines
  };
}

/**
 * ------------------------------------------------------------
 * DOUBLE-ENTRY VALIDATION
 * ------------------------------------------------------------
 */
export function assertBalanced(
  lines: JournalLine[]
): {
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
} {

  const totalDebit = round2(
    lines.reduce(
      (sum, line) =>
        sum + Number(line.debit),
      0
    )
  );

  const totalCredit = round2(
    lines.reduce(
      (sum, line) =>
        sum + Number(line.credit),
      0
    )
  );

  return {
    totalDebit,
    totalCredit,
    isBalanced:
      nearlyEqual(
        totalDebit,
        totalCredit
      )
  };
}