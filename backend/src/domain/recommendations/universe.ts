/**
 * Curated recommendation universe.
 *
 * This is a static seed list of well-known, liquid large/mid-cap tickers
 * spread across ten sectors and three markets (NSE, BSE, US). It exists so
 * `/recommendations` has a sensible default set of names to screen without
 * requiring the caller to already know which tickers to ask about — actual
 * prices, technicals and fundamentals are always fetched live from Yahoo
 * Finance (see `recommendationEngine.ts`), nothing here is hard-coded data
 * about the stock itself.
 *
 * The list is intentionally bounded per sector/market (3-4 names) to keep
 * the number of concurrent Yahoo Finance calls reasonable — see
 * `runWithConcurrencyLimit` in `recommendationEngine.ts`.
 */

export type Market = "NSE" | "BSE" | "US";

export const SECTORS = [
  "Banking & Financial Services",
  "Information Technology",
  "Healthcare & Pharmaceuticals",
  "Energy",
  "Consumer Goods",
  "Industrials",
  "Automotive",
  "Telecommunications",
  "Real Estate",
  "Utilities"
] as const;

export type Sector = (typeof SECTORS)[number];

export type UniverseEntry = {
  /** Internal ticker used across the app's own APIs, e.g. "TCS.NS", "AAPL". */
  ticker: string;
  name: string;
  market: Market;
  sector: Sector;
};

// NSE (India) — National Stock Exchange, ".NS" suffix
const NSE: UniverseEntry[] = [
  { ticker: "HDFCBANK.NS", name: "HDFC Bank", market: "NSE", sector: "Banking & Financial Services" },
  { ticker: "ICICIBANK.NS", name: "ICICI Bank", market: "NSE", sector: "Banking & Financial Services" },
  { ticker: "AXISBANK.NS", name: "Axis Bank", market: "NSE", sector: "Banking & Financial Services" },
  { ticker: "KOTAKBANK.NS", name: "Kotak Mahindra Bank", market: "NSE", sector: "Banking & Financial Services" },
  { ticker: "TCS.NS", name: "Tata Consultancy Services", market: "NSE", sector: "Information Technology" },
  { ticker: "INFY.NS", name: "Infosys", market: "NSE", sector: "Information Technology" },
  { ticker: "HCLTECH.NS", name: "HCL Technologies", market: "NSE", sector: "Information Technology" },
  { ticker: "WIPRO.NS", name: "Wipro", market: "NSE", sector: "Information Technology" },
  { ticker: "SUNPHARMA.NS", name: "Sun Pharmaceutical Industries", market: "NSE", sector: "Healthcare & Pharmaceuticals" },
  { ticker: "DRREDDY.NS", name: "Dr. Reddy's Laboratories", market: "NSE", sector: "Healthcare & Pharmaceuticals" },
  { ticker: "CIPLA.NS", name: "Cipla", market: "NSE", sector: "Healthcare & Pharmaceuticals" },
  { ticker: "DIVISLAB.NS", name: "Divi's Laboratories", market: "NSE", sector: "Healthcare & Pharmaceuticals" },
  { ticker: "RELIANCE.NS", name: "Reliance Industries", market: "NSE", sector: "Energy" },
  { ticker: "ONGC.NS", name: "Oil & Natural Gas Corporation", market: "NSE", sector: "Energy" },
  { ticker: "BPCL.NS", name: "Bharat Petroleum Corporation", market: "NSE", sector: "Energy" },
  { ticker: "IOC.NS", name: "Indian Oil Corporation", market: "NSE", sector: "Energy" },
  { ticker: "HINDUNILVR.NS", name: "Hindustan Unilever", market: "NSE", sector: "Consumer Goods" },
  { ticker: "ITC.NS", name: "ITC Limited", market: "NSE", sector: "Consumer Goods" },
  { ticker: "NESTLEIND.NS", name: "Nestle India", market: "NSE", sector: "Consumer Goods" },
  { ticker: "BRITANNIA.NS", name: "Britannia Industries", market: "NSE", sector: "Consumer Goods" },
  { ticker: "LT.NS", name: "Larsen & Toubro", market: "NSE", sector: "Industrials" },
  { ticker: "SIEMENS.NS", name: "Siemens India", market: "NSE", sector: "Industrials" },
  { ticker: "ABB.NS", name: "ABB India", market: "NSE", sector: "Industrials" },
  { ticker: "ADANIPORTS.NS", name: "Adani Ports & SEZ", market: "NSE", sector: "Industrials" },
  { ticker: "MARUTI.NS", name: "Maruti Suzuki India", market: "NSE", sector: "Automotive" },
  { ticker: "M&M.NS", name: "Mahindra & Mahindra", market: "NSE", sector: "Automotive" },
  { ticker: "TATAMOTORS.NS", name: "Tata Motors", market: "NSE", sector: "Automotive" },
  { ticker: "BAJAJ-AUTO.NS", name: "Bajaj Auto", market: "NSE", sector: "Automotive" },
  { ticker: "BHARTIARTL.NS", name: "Bharti Airtel", market: "NSE", sector: "Telecommunications" },
  { ticker: "IDEA.NS", name: "Vodafone Idea", market: "NSE", sector: "Telecommunications" },
  { ticker: "TATACOMM.NS", name: "Tata Communications", market: "NSE", sector: "Telecommunications" },
  { ticker: "INDUSTOWER.NS", name: "Indus Towers", market: "NSE", sector: "Telecommunications" },
  { ticker: "DLF.NS", name: "DLF Limited", market: "NSE", sector: "Real Estate" },
  { ticker: "GODREJPROP.NS", name: "Godrej Properties", market: "NSE", sector: "Real Estate" },
  { ticker: "OBEROIRLTY.NS", name: "Oberoi Realty", market: "NSE", sector: "Real Estate" },
  { ticker: "PRESTIGE.NS", name: "Prestige Estates Projects", market: "NSE", sector: "Real Estate" },
  { ticker: "NTPC.NS", name: "NTPC Limited", market: "NSE", sector: "Utilities" },
  { ticker: "POWERGRID.NS", name: "Power Grid Corporation of India", market: "NSE", sector: "Utilities" },
  { ticker: "TATAPOWER.NS", name: "Tata Power Company", market: "NSE", sector: "Utilities" },
  { ticker: "ADANIPOWER.NS", name: "Adani Power", market: "NSE", sector: "Utilities" }
];

// BSE (India) — Bombay Stock Exchange, ".BO" suffix. Same companies as NSE
// where dual-listed, since Yahoo carries most large-caps on both exchanges.
const BSE: UniverseEntry[] = [
  { ticker: "HDFCBANK.BO", name: "HDFC Bank", market: "BSE", sector: "Banking & Financial Services" },
  { ticker: "KOTAKBANK.BO", name: "Kotak Mahindra Bank", market: "BSE", sector: "Banking & Financial Services" },
  { ticker: "SBIN.BO", name: "State Bank of India", market: "BSE", sector: "Banking & Financial Services" },
  { ticker: "AXISBANK.BO", name: "Axis Bank", market: "BSE", sector: "Banking & Financial Services" },
  { ticker: "TCS.BO", name: "Tata Consultancy Services", market: "BSE", sector: "Information Technology" },
  { ticker: "WIPRO.BO", name: "Wipro", market: "BSE", sector: "Information Technology" },
  { ticker: "INFY.BO", name: "Infosys", market: "BSE", sector: "Information Technology" },
  { ticker: "HCLTECH.BO", name: "HCL Technologies", market: "BSE", sector: "Information Technology" },
  { ticker: "CIPLA.BO", name: "Cipla", market: "BSE", sector: "Healthcare & Pharmaceuticals" },
  { ticker: "APOLLOHOSP.BO", name: "Apollo Hospitals Enterprise", market: "BSE", sector: "Healthcare & Pharmaceuticals" },
  { ticker: "SUNPHARMA.BO", name: "Sun Pharmaceutical Industries", market: "BSE", sector: "Healthcare & Pharmaceuticals" },
  { ticker: "DRREDDY.BO", name: "Dr. Reddy's Laboratories", market: "BSE", sector: "Healthcare & Pharmaceuticals" },
  { ticker: "BPCL.BO", name: "Bharat Petroleum Corporation", market: "BSE", sector: "Energy" },
  { ticker: "COALINDIA.BO", name: "Coal India", market: "BSE", sector: "Energy" },
  { ticker: "RELIANCE.BO", name: "Reliance Industries", market: "BSE", sector: "Energy" },
  { ticker: "ONGC.BO", name: "Oil & Natural Gas Corporation", market: "BSE", sector: "Energy" },
  { ticker: "NESTLEIND.BO", name: "Nestle India", market: "BSE", sector: "Consumer Goods" },
  { ticker: "BRITANNIA.BO", name: "Britannia Industries", market: "BSE", sector: "Consumer Goods" },
  { ticker: "HINDUNILVR.BO", name: "Hindustan Unilever", market: "BSE", sector: "Consumer Goods" },
  { ticker: "ITC.BO", name: "ITC Limited", market: "BSE", sector: "Consumer Goods" },
  { ticker: "ABB.BO", name: "ABB India", market: "BSE", sector: "Industrials" },
  { ticker: "ADANIPORTS.BO", name: "Adani Ports & SEZ", market: "BSE", sector: "Industrials" },
  { ticker: "LT.BO", name: "Larsen & Toubro", market: "BSE", sector: "Industrials" },
  { ticker: "SIEMENS.BO", name: "Siemens India", market: "BSE", sector: "Industrials" },
  { ticker: "BAJAJ-AUTO.BO", name: "Bajaj Auto", market: "BSE", sector: "Automotive" },
  { ticker: "EICHERMOT.BO", name: "Eicher Motors", market: "BSE", sector: "Automotive" },
  { ticker: "MARUTI.BO", name: "Maruti Suzuki India", market: "BSE", sector: "Automotive" },
  { ticker: "TATAMOTORS.BO", name: "Tata Motors", market: "BSE", sector: "Automotive" },
  { ticker: "TATACOMM.BO", name: "Tata Communications", market: "BSE", sector: "Telecommunications" },
  { ticker: "INDUSTOWER.BO", name: "Indus Towers", market: "BSE", sector: "Telecommunications" },
  { ticker: "BHARTIARTL.BO", name: "Bharti Airtel", market: "BSE", sector: "Telecommunications" },
  { ticker: "IDEA.BO", name: "Vodafone Idea", market: "BSE", sector: "Telecommunications" },
  { ticker: "OBEROIRLTY.BO", name: "Oberoi Realty", market: "BSE", sector: "Real Estate" },
  { ticker: "PRESTIGE.BO", name: "Prestige Estates Projects", market: "BSE", sector: "Real Estate" },
  { ticker: "DLF.BO", name: "DLF Limited", market: "BSE", sector: "Real Estate" },
  { ticker: "GODREJPROP.BO", name: "Godrej Properties", market: "BSE", sector: "Real Estate" },
  { ticker: "TATAPOWER.BO", name: "Tata Power Company", market: "BSE", sector: "Utilities" },
  { ticker: "ADANIPOWER.BO", name: "Adani Power", market: "BSE", sector: "Utilities" },
  { ticker: "NTPC.BO", name: "NTPC Limited", market: "BSE", sector: "Utilities" },
  { ticker: "POWERGRID.BO", name: "Power Grid Corporation of India", market: "BSE", sector: "Utilities" }
];

// US — NYSE/Nasdaq, no suffix (Yahoo's own convention)
const US: UniverseEntry[] = [
  { ticker: "JPM", name: "JPMorgan Chase", market: "US", sector: "Banking & Financial Services" },
  { ticker: "BAC", name: "Bank of America", market: "US", sector: "Banking & Financial Services" },
  { ticker: "WFC", name: "Wells Fargo", market: "US", sector: "Banking & Financial Services" },
  { ticker: "GS", name: "Goldman Sachs", market: "US", sector: "Banking & Financial Services" },
  { ticker: "AAPL", name: "Apple", market: "US", sector: "Information Technology" },
  { ticker: "MSFT", name: "Microsoft", market: "US", sector: "Information Technology" },
  { ticker: "GOOGL", name: "Alphabet", market: "US", sector: "Information Technology" },
  { ticker: "NVDA", name: "NVIDIA", market: "US", sector: "Information Technology" },
  { ticker: "JNJ", name: "Johnson & Johnson", market: "US", sector: "Healthcare & Pharmaceuticals" },
  { ticker: "PFE", name: "Pfizer", market: "US", sector: "Healthcare & Pharmaceuticals" },
  { ticker: "UNH", name: "UnitedHealth Group", market: "US", sector: "Healthcare & Pharmaceuticals" },
  { ticker: "MRK", name: "Merck & Co.", market: "US", sector: "Healthcare & Pharmaceuticals" },
  { ticker: "XOM", name: "Exxon Mobil", market: "US", sector: "Energy" },
  { ticker: "CVX", name: "Chevron", market: "US", sector: "Energy" },
  { ticker: "COP", name: "ConocoPhillips", market: "US", sector: "Energy" },
  { ticker: "SLB", name: "Schlumberger", market: "US", sector: "Energy" },
  { ticker: "PG", name: "Procter & Gamble", market: "US", sector: "Consumer Goods" },
  { ticker: "KO", name: "Coca-Cola", market: "US", sector: "Consumer Goods" },
  { ticker: "PEP", name: "PepsiCo", market: "US", sector: "Consumer Goods" },
  { ticker: "WMT", name: "Walmart", market: "US", sector: "Consumer Goods" },
  { ticker: "CAT", name: "Caterpillar", market: "US", sector: "Industrials" },
  { ticker: "HON", name: "Honeywell International", market: "US", sector: "Industrials" },
  { ticker: "BA", name: "Boeing", market: "US", sector: "Industrials" },
  { ticker: "GE", name: "General Electric", market: "US", sector: "Industrials" },
  { ticker: "TSLA", name: "Tesla", market: "US", sector: "Automotive" },
  { ticker: "GM", name: "General Motors", market: "US", sector: "Automotive" },
  { ticker: "F", name: "Ford Motor", market: "US", sector: "Automotive" },
  { ticker: "TM", name: "Toyota Motor", market: "US", sector: "Automotive" },
  { ticker: "T", name: "AT&T", market: "US", sector: "Telecommunications" },
  { ticker: "VZ", name: "Verizon Communications", market: "US", sector: "Telecommunications" },
  { ticker: "TMUS", name: "T-Mobile US", market: "US", sector: "Telecommunications" },
  { ticker: "CMCSA", name: "Comcast", market: "US", sector: "Telecommunications" },
  { ticker: "AMT", name: "American Tower", market: "US", sector: "Real Estate" },
  { ticker: "PLD", name: "Prologis", market: "US", sector: "Real Estate" },
  { ticker: "O", name: "Realty Income", market: "US", sector: "Real Estate" },
  { ticker: "SPG", name: "Simon Property Group", market: "US", sector: "Real Estate" },
  { ticker: "NEE", name: "NextEra Energy", market: "US", sector: "Utilities" },
  { ticker: "DUK", name: "Duke Energy", market: "US", sector: "Utilities" },
  { ticker: "SO", name: "Southern Company", market: "US", sector: "Utilities" },
  { ticker: "D", name: "Dominion Energy", market: "US", sector: "Utilities" }
];

export const RECOMMENDATION_UNIVERSE: UniverseEntry[] = [...NSE, ...BSE, ...US];

export function getUniverse(filter?: { market?: Market; sector?: Sector }) {
  return RECOMMENDATION_UNIVERSE.filter((entry) => {
    if (filter?.market && entry.market !== filter.market) return false;
    if (filter?.sector && entry.sector !== filter.sector) return false;
    return true;
  });
}
