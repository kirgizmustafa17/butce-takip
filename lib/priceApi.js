// Price API using internal proxy to bigpara (via scraping)
// API URL: /api/prices

const BASE_URL = '/api/prices';

// Currency codes mapping
export const INVESTMENT_TYPES = {
  XAU: { name: 'Altın 24 Ayar (Gram)', code: 'gram-altin', unit: 'gram' },
  XAU22: { name: 'Altın 22 Ayar (Gram)', code: '22-ayar-bilezik', unit: 'gram' },
  XAG: { name: 'Gümüş (Gram)', code: 'gumus', unit: 'gram' },
};

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
 * Since Bigpara proxy returns all data in one JSON, we just fetch once.
 * @param {string[]} currencyCodes - Array of currency codes (Internal keys like XAU)
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
    const updateDate = data.updateDate; // e.g. "2026-02-02T..."

    // Always fetch everything we support
    for (const [key, config] of Object.entries(INVESTMENT_TYPES)) {
      let price = 0;

      const apiCode = config.code;
      // Bigpara scraper returns directly mapped keys: data['gram-altin']
      const item = data[apiCode];

      if (item) {
        price = parseFloat(item);
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
    if (currencyCodes) {
      currencyCodes.forEach(c => fallback[c] = null);
    }
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
