export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Full EMA series (same length as input, first `period-1` values are seeded via SMA). */
export function emaSeries(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out: number[] = new Array(values.length).fill(NaN);
  out[period - 1] = seed;
  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

export function ema(values: number[], period: number): number | null {
  const series = emaSeries(values, period);
  if (series.length === 0) return null;
  const last = series[series.length - 1];
  return Number.isFinite(last) ? last : null;
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): { macdLine: number; signalLine: number; histogram: number } | null {
  if (values.length < slow + signalPeriod) return null;

  const fastSeries = emaSeries(values, fast);
  const slowSeries = emaSeries(values, slow);

  const macdSeries: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(fastSeries[i]) && Number.isFinite(slowSeries[i])) {
      macdSeries.push(fastSeries[i] - slowSeries[i]);
    }
  }
  if (macdSeries.length < signalPeriod) return null;

  const signalSeries = emaSeries(macdSeries, signalPeriod);
  const macdLine = macdSeries[macdSeries.length - 1];
  const signalLine = signalSeries[signalSeries.length - 1];
  if (!Number.isFinite(macdLine) || !Number.isFinite(signalLine)) return null;

  return { macdLine, signalLine, histogram: macdLine - signalLine };
}

export function pivotPoints(high: number, low: number, close: number) {
  const pivot = (high + low + close) / 3;
  const r1 = 2 * pivot - low;
  const s1 = 2 * pivot - high;
  const r2 = pivot + (high - low);
  const s2 = pivot - (high - low);
  const r3 = high + 2 * (pivot - low);
  const s3 = low - 2 * (high - pivot);
  return { pivot, r1, r2, r3, s1, s2, s3 };
}

/** Simple linear-regression-free beta: cov(stock, index) / var(index) over aligned returns. */
export function beta(stockCloses: number[], indexCloses: number[]): number | null {
  const n = Math.min(stockCloses.length, indexCloses.length);
  if (n < 10) return null;

  const stockSlice = stockCloses.slice(stockCloses.length - n);
  const indexSlice = indexCloses.slice(indexCloses.length - n);

  const stockReturns: number[] = [];
  const indexReturns: number[] = [];
  for (let i = 1; i < n; i++) {
    if (stockSlice[i - 1] > 0) stockReturns.push((stockSlice[i] - stockSlice[i - 1]) / stockSlice[i - 1]);
    if (indexSlice[i - 1] > 0) indexReturns.push((indexSlice[i] - indexSlice[i - 1]) / indexSlice[i - 1]);
  }
  if (stockReturns.length < 5 || stockReturns.length !== indexReturns.length) return null;

  const meanStock = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
  const meanIndex = indexReturns.reduce((a, b) => a + b, 0) / indexReturns.length;

  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < stockReturns.length; i++) {
    covariance += (stockReturns[i] - meanStock) * (indexReturns[i] - meanIndex);
    variance += (indexReturns[i] - meanIndex) ** 2;
  }
  if (variance === 0) return null;
  return covariance / variance;
}

export type Verdict = "Bullish" | "Bearish" | "Neutral";
