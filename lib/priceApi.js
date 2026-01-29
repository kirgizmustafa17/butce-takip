// Price API using fawazahmed0/exchange-api (free, no limits)
// API URL: https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies

const BASE_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies';

// 1 ons = 31.1035 gram
const OUNCE_TO_GRAM = 31.1035;

// 22 ayar altın = 24 ayar altının %91.67'si (22/24)
const KARAT_22_RATIO = 22 / 24;

// Currency codes mapping
export const INVESTMENT_TYPES = {
  XAU: { name: 'Altın 24 Ayar (Gram)', code: 'xau', unit: 'gram', isOunce: true },
  XAU22: { name: 'Altın 22 Ayar (Gram)', code: 'xau', unit: 'gram', isOunce: true, is22Karat: true },
  XAG: { name: 'Gümüş (Gram)', code: 'xag', unit: 'gram', isOunce: true },
  USD: { name: 'Amerikan Doları', code: 'usd', unit: 'adet', isOunce: false },
  EUR: { name: 'Euro', code: 'eur', unit: 'adet', isOunce: false },
  GBP: { name: 'İngiliz Sterlini', code: 'gbp', unit: 'adet', isOunce: false },
};

/**
 * Fetch current price of a currency/commodity in TRY
 * @param {string} currencyCode - Currency code (xau, xag, usd, eur, etc.)
 * @returns {Promise<number>} - Current price in TRY (gram for gold/silver)
 */
export async function fetchPriceInTRY(currencyCode) {
  try {
    const response = await fetch(`${BASE_URL}/${currencyCode.toLowerCase()}.json`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch price for ${currencyCode}`);
    }
    
    const data = await response.json();
    let tryPrice = data[currencyCode.toLowerCase()]?.try;
    
    if (!tryPrice) {
      throw new Error(`TRY price not found for ${currencyCode}`);
    }
    
    // Convert ounce to gram for gold and silver
    const investmentType = INVESTMENT_TYPES[currencyCode.toUpperCase()];
    if (investmentType?.isOunce) {
      tryPrice = tryPrice / OUNCE_TO_GRAM;
    }
    
    return tryPrice;
  } catch (error) {
    console.error('Error fetching price:', error);
    throw error;
  }
}

/**
 * Fetch multiple prices at once
 * @param {string[]} currencyCodes - Array of currency codes
 * @returns {Promise<Object>} - Object with currency codes as keys and TRY prices as values
 */
export async function fetchMultiplePrices(currencyCodes) {
  const prices = {};
  
  // First, check if we need XAU for XAU22 calculation
  const needsXAU = currencyCodes.some(c => c.toUpperCase() === 'XAU22');
  const uniqueCodes = [...new Set(currencyCodes.map(c => {
    // XAU22 uses XAU data
    if (c.toUpperCase() === 'XAU22') return 'XAU';
    return c.toUpperCase();
  }))];
  
  // Fetch actual prices
  await Promise.all(
    uniqueCodes.map(async (code) => {
      try {
        prices[code] = await fetchPriceInTRY(code);
      } catch (error) {
        prices[code] = null;
      }
    })
  );
  
  // Calculate XAU22 from XAU if needed
  if (needsXAU && prices['XAU']) {
    prices['XAU22'] = prices['XAU'] * KARAT_22_RATIO;
  }
  
  return prices;
}

/**
 * Calculate profit/loss for an investment
 * @param {number} quantity - Amount of investment
 * @param {number} purchasePrice - Price at purchase (per unit in TRY)
 * @param {number} currentPrice - Current price (per unit in TRY)
 * @returns {Object} - Profit/loss details
 */
export function calculateProfitLoss(quantity, purchasePrice, currentPrice) {
  const totalCost = quantity * purchasePrice;
  const currentValue = quantity * currentPrice;
  const profitLoss = currentValue - totalCost;
  const profitLossPercent = totalCost > 0 ? ((profitLoss / totalCost) * 100) : 0;
  
  return {
    totalCost,
    currentValue,
    profitLoss,
    profitLossPercent,
    isProfit: profitLoss >= 0
  };
}
