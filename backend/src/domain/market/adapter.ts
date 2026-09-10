import { normalizeTicker, toYahooSymbol } from "./tickerSymbols";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

/**
 * Curated NSE/BSE sector peers, keyed by Yahoo's own sector taxonomy string
 * (Technology, Financial Services, Healthcare, etc — these match what
 * assetProfile.sector actually returns for Indian listings). Used as the
 * primary source for "Similar Stocks" since Yahoo's search API isn't
 * built for category-style lookups and returns weak or empty results
 * when you search an industry name as text.
 */
const SECTOR_PEERS_INDIA: Record<string, string[]> = {
  Technology: ["TCS.NS", "INFY.NS", "WIPRO.NS", "HCLTECH.NS", "TECHM.NS", "LTIM.NS"],
  "Financial Services": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS", "BAJFINANCE.NS"],
  Healthcare: ["SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS", "DIVISLAB.NS", "APOLLOHOSP.NS", "LUPIN.NS"],
  "Consumer Cyclical": ["TITAN.NS", "TRENT.NS", "MARUTI.NS", "M&M.NS", "BAJAJ-AUTO.NS", "EICHERMOT.NS"],
  "Consumer Defensive": ["HINDUNILVR.NS", "ITC.NS", "NESTLEIND.NS", "BRITANNIA.NS", "DABUR.NS", "TATACONSUM.NS"],
  Energy: ["RELIANCE.NS", "ONGC.NS", "BPCL.NS", "IOC.NS", "GAIL.NS", "COALINDIA.NS"],
  "Basic Materials": ["TATASTEEL.NS", "HINDALCO.NS", "JSWSTEEL.NS", "VEDL.NS", "UPL.NS", "PIDILITIND.NS"],
  Industrials: ["LT.NS", "SIEMENS.NS", "ABB.NS", "BHEL.NS", "ADANIPORTS.NS", "HAL.NS"],
  Utilities: ["NTPC.NS", "POWERGRID.NS", "TATAPOWER.NS", "ADANIPOWER.NS", "NHPC.NS"],
  "Real Estate": ["DLF.NS", "GODREJPROP.NS", "OBEROIRLTY.NS", "PRESTIGE.NS", "PHOENIXLTD.NS"],
  "Communication Services": ["BHARTIARTL.NS", "IDEA.NS", "INDUSTOWER.NS", "TATACOMM.NS"]
};

/**
 * The Adapter interface defining the standard contract for fetching market data.
 * This obeys the Dependency Inversion Principle, decoupling the rest of the application
 * from the specific external data provider (e.g., Yahoo Finance).
 */
export type OhlcPoint = { time: string; open: number; high: number; low: number; close: number; volume: number };

export interface IMarketDataAdapter {
  getLivePrice(ticker: string): Promise<number | null>;
  getBulkLivePrices(tickers: string[]): Promise<Array<{ ticker: string; price: number; volume: number }>>;
  getHistoricalPrices(ticker: string, from: Date, interval?: string): Promise<OhlcPoint[]>;
  getProfile(ticker: string): Promise<any>;
  searchSymbols(query: string): Promise<Array<{ ticker: string; name: string; exchange: string; type: string }>>;
  getSimilarStocks(ticker: string): Promise<Array<{ ticker: string; name: string; price: number | null; changePct: number | null; marketCap: number | null }>>;
  getNews(ticker: string): Promise<Array<{ title: string; link: string; publisher: string; publishedAt: string | null; thumbnail: string | null }>>;
}

/**
 * Concrete implementation of the Adapter pattern for Yahoo Finance.
 * Encapsulates all library-specific fetching and data mapping logic.
 */
export class YahooFinanceAdapter implements IMarketDataAdapter {
  async getLivePrice(ticker: string): Promise<number | null> {
    const symbol = toYahooSymbol(ticker);
    try {
      const result = await yahooFinance.quote(symbol);
      const live = Number(result?.regularMarketPrice ?? 0);
      if (Number.isFinite(live) && live > 0) return live;

      const previousClose = Number(result?.regularMarketPreviousClose ?? 0);
      if (Number.isFinite(previousClose) && previousClose > 0) return previousClose;

      const history = await yahooFinance.chart(symbol, { period1: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) });
      if (history?.quotes?.length) {
        for (let idx = history.quotes.length - 1; idx >= 0; idx -= 1) {
          const value = history.quotes[idx].close;
          if (value && Number.isFinite(value) && value > 0) return value;
        }
      }
    } catch (err) {
      console.error(`[YahooFinanceAdapter] Failed spot price for ${symbol}:`, err);
    }
    return null;
  }

  async getBulkLivePrices(tickers: string[]): Promise<Array<{ ticker: string; price: number; volume: number }>> {
    if (tickers.length === 0) return [];
    
    const symbols = tickers.map(toYahooSymbol);
    try {
      const results = await yahooFinance.quote(symbols);
      const resultsArray = Array.isArray(results) ? results : [results];
      
      if (!resultsArray || resultsArray.length === 0) return [];

      const fetched: Array<{ ticker: string; price: number; volume: number }> = [];

      for (const row of resultsArray) {
        const live = Number(row?.regularMarketPrice ?? row?.regularMarketPreviousClose ?? 0);
        if (Number.isFinite(live) && live > 0) {
          const symbolStr = String(row.symbol);
          const internalTicker = tickers.find(t => toYahooSymbol(t) === symbolStr) || 
            tickers.find(t => t.toUpperCase() === symbolStr.toUpperCase()) || symbolStr;

          const totalVolume = Number(row?.regularMarketVolume ?? 0);
          const tickVolume = Math.max(1, Math.floor(Math.random() * (totalVolume > 10000 ? 50 : 10)));

          fetched.push({
            ticker: normalizeTicker(internalTicker),
            price: live,
            volume: tickVolume
          });
        }
      }
      return fetched;
    } catch (err) {
      console.error("[YahooFinanceAdapter] Failed bulk fetching:", err);
      return [];
    }
  }

  async getHistoricalPrices(ticker: string, from: Date, interval: string = "1d"): Promise<OhlcPoint[]> {
    const symbol = toYahooSymbol(ticker);
    try {
      const history = await yahooFinance.chart(symbol, {
        period1: from,
        interval: interval as any
      });

      if (!history?.quotes || history.quotes.length === 0) return [];

      const points: OhlcPoint[] = [];
      for (const quote of history.quotes) {
        if (quote.close && Number.isFinite(quote.close) && quote.date) {
          points.push({
            time: quote.date.toISOString(),
            open: Number(quote.open ?? quote.close),
            high: Number(quote.high ?? quote.close),
            low: Number(quote.low ?? quote.close),
            close: Number(quote.close),
            volume: Number(quote.volume ?? 0)
          });
        }
      }
      return points;
    } catch (err: any) {
      throw new Error(`Yahoo history unavailable (${err.message})`);
    }
  }

  async getProfile(ticker: string): Promise<any> {
    const symbol = toYahooSymbol(ticker);
    try {
      const summary = await yahooFinance.quoteSummary(symbol, {
        modules: [
          "assetProfile",
          "summaryDetail",
          "price",
          "defaultKeyStatistics",
          "financialData",
          "incomeStatementHistoryQuarterly",
          "majorHoldersBreakdown"
        ]
      });

      const detail = summary.summaryDetail;
      const price = summary.price;
      const stats = summary.defaultKeyStatistics;
      const financials = summary.financialData;
      const holders = summary.majorHoldersBreakdown;

      const previousClose = detail?.previousClose ?? price?.regularMarketPreviousClose ?? null;
      const isIndianListing = toYahooSymbol(ticker).endsWith(".NS") || toYahooSymbol(ticker).endsWith(".BO");

      // Quarterly financials — most recent 5 quarters, oldest first for charting.
      const quarterlyFinancials = (summary.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [])
        .slice(0, 5)
        .reverse()
        .map((q: any) => ({
          period: new Date(q.endDate).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
          revenue: q.totalRevenue ?? null,
          profit: q.netIncome ?? null
        }));

      // Shareholding pattern — Yahoo only exposes insider vs institutional
      // holding (not the Indian promoter/DII/FII split), so map honestly.
      const insiders = holders?.insidersPercentHeld != null ? holders.insidersPercentHeld * 100 : null;
      const institutions = holders?.institutionsPercentHeld != null ? holders.institutionsPercentHeld * 100 : null;
      const publicHolding = insiders != null && institutions != null ? Math.max(0, 100 - insiders - institutions) : null;

      return {
        name: price?.shortName || ticker,
        sector: summary.assetProfile?.sector || "N/A",
        industry: summary.assetProfile?.industry || "N/A",
        description: summary.assetProfile?.longBusinessSummary || "",

        // Performance
        open: detail?.open ?? price?.regularMarketOpen ?? null,
        dayLow: detail?.dayLow ?? price?.regularMarketDayLow ?? null,
        dayHigh: detail?.dayHigh ?? price?.regularMarketDayHigh ?? null,
        previousClose,
        volume: detail?.volume ?? price?.regularMarketVolume ?? null,
        fiftyTwoWeekLow: detail?.fiftyTwoWeekLow ?? null,
        fiftyTwoWeekHigh: detail?.fiftyTwoWeekHigh ?? null,
        // NSE/BSE circuit bands aren't exposed by Yahoo — approximate the common
        // ±20% band off the previous close for Indian listings only.
        lowerCircuit: isIndianListing && previousClose ? Number((previousClose * 0.8).toFixed(2)) : null,
        upperCircuit: isIndianListing && previousClose ? Number((previousClose * 1.2).toFixed(2)) : null,

        // Fundamentals
        marketCap: detail?.marketCap ?? null,
        peRatio: detail?.trailingPE ?? null,
        industryPE: null,
        pbRatio: stats?.priceToBook ?? null,
        faceValue: null,
        roe: financials?.returnOnEquity != null ? Number((financials.returnOnEquity * 100).toFixed(2)) : null,
        eps: stats?.trailingEps ?? null,
        dividendYield: detail?.dividendYield != null ? Number((detail.dividendYield * 100).toFixed(2)) : null,
        bookValue: stats?.bookValue ?? null,
        debtToEquity: financials?.debtToEquity != null ? Number((financials.debtToEquity / 100).toFixed(2)) : null,

        // Financial performance (quarterly)
        quarterlyFinancials,

        // Shareholding pattern (insiders/institutions/public — approximated from Yahoo's data)
        shareholding:
          insiders != null || institutions != null
            ? {
                insiders: insiders != null ? Number(insiders.toFixed(2)) : null,
                institutions: institutions != null ? Number(institutions.toFixed(2)) : null,
                public: publicHolding != null ? Number(publicHolding.toFixed(2)) : null
              }
            : null
      };
    } catch (err: any) {
      console.error("[YahooFinanceAdapter] Failed profile fetch:", err.message);
      return null;
    }
  }

  async searchSymbols(query: string): Promise<Array<{ ticker: string; name: string; exchange: string; type: string }>> {
    if (!query || query.trim().length < 1) return [];
    try {
      const result = await yahooFinance.search(query, { quotesCount: 10, newsCount: 0 });
      return (result.quotes ?? [])
        .filter((q: any) => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "INDEX"))
        .map((q: any) => ({
          ticker: q.symbol,
          name: q.shortname || q.longname || q.symbol,
          exchange: q.exchange || "",
          type: q.quoteType || ""
        }));
    } catch (err: any) {
      console.error("[YahooFinanceAdapter] Symbol search failed:", err.message);
      return [];
    }
  }

  async getSimilarStocks(
    ticker: string
  ): Promise<Array<{ ticker: string; name: string; price: number | null; changePct: number | null; marketCap: number | null }>> {
    const symbol = toYahooSymbol(ticker);
    let candidateSymbols: string[] = [];

    try {
      const profile = await this.getProfile(ticker);
      const sector = profile?.sector;

      // Primary: a curated peer list per Yahoo sector taxonomy for Indian
      // large/mid-caps — reliable, unlike text-searching an industry phrase
      // against Yahoo's company/ticker search index (which isn't built for
      // category lookups and returns poor or empty results for that).
      if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) {
        const peers = SECTOR_PEERS_INDIA[sector ?? ""] ?? [];
        candidateSymbols = peers.filter((s) => s !== symbol);
      }

      // Fallback (and for non-Indian tickers): try a plain-text search on the
      // industry/sector name. Works better for well-known global sectors.
      if (candidateSymbols.length === 0) {
        const query = profile?.industry && profile.industry !== "N/A" ? profile.industry : sector;
        if (query && query !== "N/A") {
          const results = await this.searchSymbols(query);
          candidateSymbols = results.map((r) => r.ticker).filter((s) => s !== symbol);
        }
      }
    } catch (err: any) {
      console.error("[YahooFinanceAdapter] Similar-stock lookup failed:", err.message);
    }

    candidateSymbols = candidateSymbols.filter((s) => s !== symbol).slice(0, 8);
    if (candidateSymbols.length === 0) return [];

    try {
      const results = await yahooFinance.quote(candidateSymbols);
      const resultsArray = Array.isArray(results) ? results : [results];

      return resultsArray
        .filter((row: any) => row?.symbol)
        .map((row: any) => {
          const price = Number(row.regularMarketPrice ?? row.regularMarketPreviousClose ?? 0) || null;
          const previousClose = Number(row.regularMarketPreviousClose ?? 0) || null;
          const changePct = price && previousClose ? ((price - previousClose) / previousClose) * 100 : null;
          return {
            ticker: String(row.symbol),
            name: row.shortName || row.longName || String(row.symbol),
            price,
            changePct,
            marketCap: row.marketCap ?? null
          };
        });
    } catch (err: any) {
      console.error("[YahooFinanceAdapter] Similar-stock quote fetch failed:", err.message);
      return [];
    }
  }

  async getNews(ticker: string): Promise<Array<{ title: string; link: string; publisher: string; publishedAt: string | null; thumbnail: string | null }>> {
    const symbol = toYahooSymbol(ticker);
    try {
      // Searching by company name (not the raw ticker symbol) gets Yahoo's
      // text search to actually match relevant articles instead of a
      // generic trending-news feed.
      const profile = await this.getProfile(ticker);
      const searchTerm = profile?.name && profile.name !== ticker ? profile.name : symbol;

      const result = await yahooFinance.search(searchTerm, { quotesCount: 0, newsCount: 20 });
      const rawNews = result.news ?? [];

      // Where Yahoo tags an article with relatedTickers, keep only ones that
      // actually mention this symbol — this is what stops every stock's
      // "News" tab from showing the same generic financial headlines.
      const tagged = rawNews.filter((n: any) => Array.isArray(n.relatedTickers) && n.relatedTickers.length > 0);
      const relevant = tagged.filter((n: any) => n.relatedTickers.includes(symbol));

      // If nothing is tagged at all (thin coverage for some tickers), fall
      // back to the name-search results as-is rather than showing nothing.
      const finalNews = relevant.length > 0 ? relevant : tagged.length > 0 ? [] : rawNews;

      return finalNews.slice(0, 12).map((n: any) => ({
        title: n.title,
        link: n.link,
        publisher: n.publisher || "",
        publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : null,
        thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null
      }));
    } catch (err: any) {
      console.error("[YahooFinanceAdapter] News fetch failed:", err.message);
      return [];
    }
  }
}

// Export a singleton instance of the adapter to be used throughout the app
export const marketAdapter: IMarketDataAdapter = new YahooFinanceAdapter();