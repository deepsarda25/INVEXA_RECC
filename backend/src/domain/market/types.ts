/**
 * Market Data Types
 */

export interface PricePoint {
  time: string;
  price: number;
}

export interface StockInfo {
  ticker: string;
  displayTicker: string;
  price: number | null;
  holdingQuantity: number;
  avgCost: number;
  pnl: number;
}

export type DataSourceType = 'real' | 'simulated' | 'excel';

export interface IPriceProvider {
  getPrice(ticker: string, competitionId?: string): Promise<number | null>;
  getHistory(
    ticker: string,
    start: Date,
    end: Date,
    competitionId?: string
  ): Promise<PricePoint[]>;
}

export interface MarketDataConfig {
  tickers?: string[];
  allowInfluence?: boolean;
  dataSource?: DataSourceType;
}
