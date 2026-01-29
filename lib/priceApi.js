// Price API using fawazahmed0/exchange-api (free, no limits)
// API URL: https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies

const BASE_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies';

// 1 ons = 31.1035 gram
const OUNCE_TO_GRAM = 31.1035;

// Currency codes mapping
export const INVESTMENT_TYPES = {
  XAU: { name: 'Altın (Gram)', code: 'xau', unit: 'gram', isOunce: true },
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
  
  await Promise.all(
    currencyCodes.map(async (code) => {
      try {
        prices[code.toUpperCase()] = await fetchPriceInTRY(code);
      } catch (error) {
        prices[code.toUpperCase()] = null;
      }
    })
  );
  
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
