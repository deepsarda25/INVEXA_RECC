export interface TickerFormattingStrategy {
  format(ticker: string): string;
}

// Index tickers (NIFTY, SENSEX, BANKNIFTY, midcap/smallcap, and the US
// indices) are never suffixed with ".NS"/".BO" — their real (Yahoo) symbols
// are bare names like "NSEI", "BSESN", "DJI" etc. Blindly appending ".NS"
// because the Exchange badge says "NSE" turned "NSEI" into the invalid
// "NSEI.NS", which the price resolver can never find — that's why trading
// NIFTY/SENSEX/BANKNIFTY/etc previously failed with "No executable price
// found". Kept in sync with the same sets in
// backend/src/domain/market/marketHours.ts and frontend/src/utils/currency.ts.
const INDEX_TICKERS = new Set(["NSEI", "BSESN", "NSEBANK", "CNXMIDCAP", "CNXSC", "GSPC", "IXIC", "DJI"]);

function isIndexTicker(ticker: string): boolean {
  return INDEX_TICKERS.has(ticker.trim().toUpperCase().replace(/^\^/, ""));
}

export class USFormattingStrategy implements TickerFormattingStrategy {
  format(ticker: string): string {
    return ticker.trim().toUpperCase();
  }
}

export class SIMFormattingStrategy implements TickerFormattingStrategy {
  format(ticker: string): string {
    return ticker.trim().toUpperCase();
  }
}

export class NSEFormattingStrategy implements TickerFormattingStrategy {
  format(ticker: string): string {
    const t = ticker.trim().toUpperCase();
    if (t.includes(".") || isIndexTicker(t)) return t;
    return `${t}.NS`;
  }
}

export class BSEFormattingStrategy implements TickerFormattingStrategy {
  format(ticker: string): string {
    const t = ticker.trim().toUpperCase();
    if (t.includes(".") || isIndexTicker(t)) return t;
    return `${t}.BO`;
  }
}

export class TickerFormatter {
  private strategy: TickerFormattingStrategy;

  constructor(strategy: TickerFormattingStrategy) {
    this.strategy = strategy;
  }

  setStrategy(strategy: TickerFormattingStrategy) {
    this.strategy = strategy;
  }

  format(ticker: string): string {
    return this.strategy.format(ticker);
  }
}
