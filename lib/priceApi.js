// Price API using finans.truncgil.com (Free, Real-time for TR)
// API URL: https://finans.truncgil.com/v3/today.json

const BASE_URL = 'https://finans.truncgil.com/v3/today.json';

// 22 ayar altın = 24 ayar altının %91.67'si (22/24)
// We can also use specific 22k price if available, but calculation is safer/standard
const KARAT_22_RATIO = 22 / 24;

// Currency codes mapping
export const INVESTMENT_TYPES = {
  XAU: { name: 'Altın 24 Ayar (Gram)', code: 'gram-altin', unit: 'gram' },
  XAU22: { name: 'Altın 22 Ayar (Gram)', code: 'gram-altin', unit: 'gram', is22Karat: true },
  XAG: { name: 'Gümüş (Gram)', code: 'gumus', unit: 'gram' },
  USD: { name: 'Amerikan Doları', code: 'USD', unit: 'adet' },
  EUR: { name: 'Euro', code: 'EUR', unit: 'adet' },
  GBP: { name: 'İngiliz Sterlini', code: 'GBP', unit: 'adet' },
};

/**
 * Helper to parse Turkish number format (e.g. "2.266,62" -> 2266.62)
 */
function parseTurkishNumber(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  // Remove dots (thousands separator) and replace comma with dot (decimal separator)
  const cleanStr = value.toString().replace(/\./g, '').replace(',', '.');
  return parseFloat(cleanStr);
}

/**
 * Fetch current price of a currency/commodity in TRY
 * Uses the buffered multiple price fetcher for efficiency if single call
 */
export async function fetchPriceInTRY(currencyCode) {
  const { prices } = await fetchMultiplePrices([currencyCode]);
  // Map back to the requested code
  const typeKey = Object.keys(INVESTMENT_TYPES).find(key => INVESTMENT_TYPES[key].code === currencyCode || key === currencyCode);
  return prices[typeKey || currencyCode];
}

/**
 * Fetch multiple prices at once
 * Since Truncgil returns all data in one JSON, we just fetch once.
 * @param {string[]} currencyCodes - Array of currency codes (Internal keys like XAU, USD)
 * @returns {Promise<Object>} - Object with { prices, updateDate }
 */
export async function fetchMultiplePrices(currencyCodes) {
  try {
    const response = await fetch(BASE_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch prices: ${response.statusText}`);
    }

    const data = await response.json();
    const prices = {};
    const updateDate = data.Update_Date; // e.g. "2026-02-02 11:00:02"

    // We iterate over the INVESTMENT_TYPES to find matches for requested codes
    // Or iterate over requested codes and map them

    const requestedKeys = new Set(currencyCodes.map(c => c.toUpperCase()));

    // Always fetch everything we support if possible, but filtered by user request
    for (const [key, config] of Object.entries(INVESTMENT_TYPES)) {
      if (!requestedKeys.has(key)) continue;

      let price = 0;

      if (key === 'XAU22') {
        // Special calculation for 22K
        const parentPriceStr = data[INVESTMENT_TYPES.XAU.code]?.Selling;
        const parentPrice = parseTurkishNumber(parentPriceStr);
        price = parentPrice * KARAT_22_RATIO;
      } else {
        const apiCode = config.code;
        // Truncgil "Selling" is usually the rate
        // Data format: data["gram-altin"].Selling -> "3.000,50"
        const item = data[apiCode];
        if (item) {
          price = parseTurkishNumber(item.Selling);
        }
      }

      if (price) {
        prices[key] = price;
      } else {
        prices[key] = null;
      }
    }

    return { prices, updateDate };
  } catch (error) {
    console.error('Error fetching prices:', error);
    // Return empty object or object with nulls
    const fallback = {};
    currencyCodes.forEach(c => fallback[c] = null);
    return { prices: fallback, updateDate: null };
  }
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
