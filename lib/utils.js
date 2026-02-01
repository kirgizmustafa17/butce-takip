import { format, addDays, isWeekend, getDay } from 'date-fns';
import { tr } from 'date-fns/locale';

/**
 * Format currency amount in Turkish Lira
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: TRY)
 * @returns {string} - Formatted currency string
 */
export function formatCurrency(amount, currency = 'TRY') {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date in Turkish locale
 * @param {Date|string} date - Date to format
 * @param {string} formatStr - Format string (default: 'dd MMMM yyyy')
 * @returns {string} - Formatted date string
 */
export function formatDate(date, formatStr = 'dd MMMM yyyy') {
  return format(new Date(date), formatStr, { locale: tr });
}

/**
 * Calculate credit card due date based on statement day
 * Statement day + 10 days, but if weekend, shift to Monday
 * @param {number} statementDay - Day of month for statement (1-31)
 * @param {Date} referenceDate - Reference date (default: today)
 * @returns {Date} - Due date
 */
export function calculateDueDate(statementDay, referenceDate = new Date()) {
  const today = new Date(referenceDate);
  
  // Calculate next statement date
  let statementDate = new Date(today.getFullYear(), today.getMonth(), statementDay);
  
  // If statement date has passed this month, move to next month
  if (today.getDate() > statementDay) {
    statementDate.setMonth(statementDate.getMonth() + 1);
  }
  
  // Add 10 days for due date
  let dueDate = addDays(statementDate, 10);
  
  // If due date falls on weekend, shift to Monday
  const dayOfWeek = getDay(dueDate);
  if (dayOfWeek === 6) { // Saturday
    dueDate = addDays(dueDate, 2);
  } else if (dayOfWeek === 0) { // Sunday
    dueDate = addDays(dueDate, 1);
  }
  
  return dueDate;
}

/**
 * Calculate next statement date
 * @param {number} statementDay - Day of month for statement (1-31)
 * @param {Date} referenceDate - Reference date (default: today)
 * @returns {Date} - Next statement date
 */
export function calculateNextStatementDate(statementDay, referenceDate = new Date()) {
  const today = new Date(referenceDate);
  let statementDate = new Date(today.getFullYear(), today.getMonth(), statementDay);
  
  if (today.getDate() >= statementDay) {
    statementDate.setMonth(statementDate.getMonth() + 1);
  }
  
  return statementDate;
}

/**
 * Calculate statement date for a specific transaction
 * Returns the statement date that this transaction will appear on
 * @param {number} statementDay - Day of month for statement (1-31)
 * @param {Date} transactionDate - Date of the transaction
 * @returns {Date} - Statement date for this transaction
 */
export function calculateStatementDateForTransaction(statementDay, transactionDate) {
  const txDate = new Date(transactionDate);
  let statementDate = new Date(txDate.getFullYear(), txDate.getMonth(), statementDay);
  
  // If transaction is after statement day, it goes to next month's statement
  if (txDate.getDate() > statementDay) {
    statementDate.setMonth(statementDate.getMonth() + 1);
  }
  
  return statementDate;
}


/**
 * Generate cash flow projection for a specific date range
 * @param {number} currentBalance - Current balance (as of today)
 * @param {Array} scheduledPayments - Array of scheduled payments and future transactions
 * @param {Array} cardPayments - Array of card payment due dates with amounts
 * @param {Date} startDate - Start date of the projection
 * @param {Date} endDate - End date of the projection
 * @param {Array} pastTransactions - Array of past transactions (to calculate past balances)
 * @returns {Array} - Array of daily balance projections
 */
export function generateCashFlowProjection(currentBalance, scheduledPayments = [], cardPayments = [], startDate, endDate, pastTransactions = []) {
  const projection = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Normalize dates
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  
  // If start date is in the past, we need to calculate the starting balance
  // backing up from current balance using past transactions
  let runningBalance = currentBalance;
  
  // If start < today, we need to adjust runningBalance to be the balance at start date
  // But for the projection array loop, it's easier to verify "today's" balance matches currentBalance
  // So we'll calculate balances day by day.
  
  // First, calculate the initial balance at startDate
  // We start from currentBalance (today) and reverse-apply transactions between today and startDate
  if (start < today) {
    // Find transactions between start (inclusive) and today (exclusive)
    // Actually, to find Balance at Start, we take Balance Now and REVERSE transactions happened since then.
    // Income happened? Subtract it. Expense happened? Add it.
    
    pastTransactions.forEach(tx => {
      const txDate = new Date(tx.transaction_date);
      txDate.setHours(0, 0, 0, 0);
      
      if (txDate >= start && txDate < today) {
        if (tx.type === 'income') {
          runningBalance -= tx.amount;
        } else {
          runningBalance += tx.amount;
        }
      }
    });
  }
  
  // Calculate total days
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  
  for (let i = 0; i <= diffDays; i++) {
    const date = addDays(start, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    const dayEvents = [];
    let dayChange = 0;
    
    // Check scheduled payments/future transactions for this day
    scheduledPayments.forEach(payment => {
      const paymentDate = format(new Date(payment.date), 'yyyy-MM-dd');
      if (paymentDate === dateStr) {
        dayEvents.push({
          description: payment.description,
          amount: payment.amount,
          type: payment.type // 'income' or 'expense'
        });
        dayChange += payment.type === 'income' ? payment.amount : -payment.amount;
      }
    });
    
    // Check past transactions (if this day is in the past or today)
    if (date < today) {
      // We already handled past transactions for initial balance calc? 
      // No, for the loop, we need to APPLY them to show the change in the chart
      // But we just calculated the *starting* balance for the loop.
      // So now we apply them forward.
      
      pastTransactions.forEach(tx => {
        const txDate = new Date(tx.transaction_date);
        const txDateStr = format(txDate, 'yyyy-MM-dd');
        
        if (txDateStr === dateStr) {
           // Avoid duplicates if passed in both lists (unlikely but safe)
           // Actually pastTransactions should be separate source from scheduledPayments
           const isDuplicate = dayEvents.some(e => e.description === tx.description && e.amount === tx.amount);
           if (!isDuplicate) {
             dayEvents.push({
                description: tx.description,
                amount: tx.amount,
                type: tx.type
             });
             dayChange += tx.type === 'income' ? tx.amount : -tx.amount;
           }
        }
      });
    }
    
    // Check card payments for this day
    cardPayments.forEach(payment => {
      const paymentDate = format(new Date(payment.dueDate), 'yyyy-MM-dd');
      if (paymentDate === dateStr) {
        dayEvents.push({
          description: `${payment.cardName} Kredi Kartı Ödemesi`,
          amount: -payment.amount,
          type: 'expense'
        });
        dayChange -= payment.amount;
      }
    });
    
    runningBalance += dayChange;
    
    projection.push({
      date,
      dateStr,
      formattedDate: formatDate(date, 'dd MMM'),
      events: dayEvents,
      change: dayChange,
      balance: runningBalance
    });
  }
  
  return projection;
}

/**
 * Calculate installment payment details
 * @param {number} totalAmount - Total purchase amount
 * @param {number} installments - Number of installments
 * @param {number} currentInstallment - Current installment number (1-indexed)
 * @returns {Object} - Payment details
 */
export function calculateInstallmentDetails(totalAmount, installments, currentInstallment) {
  const monthlyPayment = totalAmount / installments;
  const remainingInstallments = installments - currentInstallment + 1;
  const remainingTotal = monthlyPayment * remainingInstallments;
  const paidTotal = monthlyPayment * (currentInstallment - 1);
  
  return {
    monthlyPayment,
    remainingInstallments,
    remainingTotal,
    paidTotal,
    progress: ((currentInstallment - 1) / installments) * 100
  };
}

/**
 * Parse mathematical expressions in input (basic support)
 * @param {string} input - Input string with potential math expression
 * @returns {number} - Calculated result
 */
export function parseAmount(input) {
  try {
    // Remove any non-math characters except digits, operators, and decimal points
    const sanitized = input.replace(/[^0-9+\-*/().]/g, '');
    // Use Function constructor to evaluate (safer than eval)
    const result = new Function(`return ${sanitized}`)();
    return isNaN(result) ? 0 : result;
  } catch {
    return 0;
  }
}
