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
 * Generate 30-day cash flow projection
 * @param {number} currentBalance - Current balance
 * @param {Array} scheduledPayments - Array of scheduled payments
 * @param {Array} cardPayments - Array of card payment due dates with amounts
 * @returns {Array} - Array of daily balance projections
 */
export function generateCashFlowProjection(currentBalance, scheduledPayments = [], cardPayments = []) {
  const projection = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let runningBalance = currentBalance;
  
  for (let i = 0; i < 30; i++) {
    const date = addDays(today, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    const dayEvents = [];
    let dayChange = 0;
    
    // Check scheduled payments for this day
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
