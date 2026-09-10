import { useEffect } from "react";
import { useMarketStore } from "../store/marketStore";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000/ws/prices";

export function usePriceSocket() {
  const updatePrice = useMarketStore((state) => state.updatePrice);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === "price") {
          const data = payload.data;
          updatePrice(String(data.ticker), Number(data.price), Number(data.ts));
        } else if (payload.event === "system_event") {
          useMarketStore.getState().setStrategyEvent({ ...payload.data, id: Date.now() });
        }
      } catch {
        // Ignore malformed messages.
      }
    };

    return () => {
      ws.close();
    };
  }, [updatePrice]);
}
