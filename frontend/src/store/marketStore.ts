import { create } from "zustand";

type PriceState = {
  prices: Record<string, { price: number; ts: number }>;
  updatePrice: (ticker: string, price: number, ts: number) => void;
  replaceAll: (rows: Array<{ ticker: string; price: number; ts: number }>) => void;
  strategyEvent: { type: string; strategy: string; id: number } | null;
  setStrategyEvent: (evt: any) => void;
};

export const useMarketStore = create<PriceState>((set) => ({
  prices: {},
  strategyEvent: null,
  setStrategyEvent: (evt) => set({ strategyEvent: evt }),
  updatePrice: (ticker, price, ts) =>
    set((state) => ({
      prices: {
        ...state.prices,
        [ticker]: { price, ts }
      }
    })),
  replaceAll: (rows) =>
    set(() => ({
      prices: rows.reduce<Record<string, { price: number; ts: number }>>((acc, row) => {
        acc[row.ticker] = { price: row.price, ts: row.ts };
        return acc;
      }, {})
    }))
}));
