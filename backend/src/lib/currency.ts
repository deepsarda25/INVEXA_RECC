/**
 * The app's portfolio and holdings are denominated in INR. US-listed
 * recommendations are priced and displayed in USD (their native currency),
 * but also need an INR-equivalent figure so they can be compared against,
 * or folded into, an INR-denominated portfolio view.
 *
 * There is no live FX feed wired into this repo, so a fixed, clearly
 * labelled assumed rate is used instead of a real-time one. Swap
 * `USD_TO_INR_RATE` for a live FX lookup if/when one is added — every
 * consumer of `usdToInr()` / `toInrAmount()` already reads the rate from
 * this one constant.
 */
import { isUsdTicker } from "../domain/market/marketHours";

export { isUsdTicker };

export const USD_TO_INR_RATE = 95;

export function usdToInr(amountUsd: number | null): number | null {
  if (amountUsd == null || !Number.isFinite(amountUsd)) return null;
  return Math.round(amountUsd * USD_TO_INR_RATE * 100) / 100;
}

/**
 * Convert an amount denominated in `ticker`'s native currency into INR —
 * the single currency the platform's virtual balance (and every ledger
 * entry: order fills, deposits, competition balances) is held in.
 *
 * This is THE function that must sit between "a live price in whatever
 * currency the stock trades in" and "money moving in/out of an INR
 * balance". NSE/BSE tickers, Indian indices, and simulator/competition
 * tickers are already INR (1:1) — only genuine US-market tickers get
 * multiplied by `USD_TO_INR_RATE`.
 */
export function toInrAmount(nativeAmount: number, ticker: string): number {
  return isUsdTicker(ticker) ? nativeAmount * USD_TO_INR_RATE : nativeAmount;
}
