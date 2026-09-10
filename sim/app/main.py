from __future__ import annotations

import json
import signal
import threading
import time
from dataclasses import asdict
from typing import Any

from confluent_kafka import Consumer, Producer

from .config import SimConfig
from .strategies import ExcelStrategy, UserInfluenceStrategy, build_strategy


class Simulator:
    def __init__(self, config: SimConfig) -> None:
        self.config = config
        self.running = True
        self.global_strategy = build_strategy(
            config.strategy,
            start_price=config.start_price,
            volatility=config.volatility,
            drift=config.drift,
            mean_strength=config.mean_reversion_strength,
            circuit_limit=config.circuit_limit,
        )
        self.strategies = {}
        self.tickers = list(config.tickers)
        self.prices = {ticker: config.start_price for ticker in self.tickers}
        self.producer = Producer({"bootstrap.servers": config.kafka_brokers})
        self.control_consumer = Consumer(
            {
                "bootstrap.servers": config.kafka_brokers,
                "group.id": "sim-control",
                "auto.offset.reset": "latest",
            }
        )

    def set_strategy(self, name: str, params: dict[str, Any] | None = None) -> None:
        params = params or {}
        self.global_strategy = build_strategy(
            name,
            start_price=float(params.get("target_mean", self.config.start_price)),
            volatility=float(params.get("volatility", self.config.volatility)),
            drift=float(params.get("drift", self.config.drift)),
            mean_strength=float(params.get("mean_strength", self.config.mean_reversion_strength)),
            circuit_limit=float(params.get("max_pct", self.config.circuit_limit)),
        )
        print(f"[sim] global strategy switched to {name}")

    def _control_loop(self) -> None:
        self.control_consumer.subscribe([self.config.control_topic])

        while self.running:
            message = self.control_consumer.poll(1.0)
            if message is None:
                continue
            if message.error():
                print(f"[sim] control consumer error: {message.error()}")
                continue

            try:
                payload = json.loads(message.value().decode("utf-8"))
                action = payload.get("action")
                
                if action == "set_strategy":
                    comp_id = payload.get("competitionId")
                    strategy_name = payload.get("strategy", "random_walk")
                    params = payload.get("params", {})
                    
                    if comp_id:
                        # Competition-specific strategy change
                        for key, st in self.strategies.items():
                            if key.startswith(f"C_{comp_id}_"):
                                new_strategy = build_strategy(
                                    strategy_name,
                                    start_price=self.prices[key],
                                    volatility=float(params.get("volatility", self.config.volatility)),
                                    drift=float(params.get("drift", self.config.drift)),
                                    mean_strength=float(params.get("mean_strength", self.config.mean_reversion_strength)),
                                    circuit_limit=float(params.get("max_pct", self.config.circuit_limit)),
                                )
                                self.strategies[key] = new_strategy
                        print(f"[sim] Competition {comp_id} strategy changed to {strategy_name}")
                    else:
                        # Global strategy change (only if no competitionId)
                        self.set_strategy(strategy_name, params)
                elif action == "launch_competition_simulated":
                    comp_id = payload.get("competitionId")
                    tickers = payload.get("tickers", [])
                    allow_influence = payload.get("allowInfluence", False)
                    
                    # Create strategies for this competition's tickers
                    for t in tickers:
                        namespaced_ticker = f"C_{comp_id}_{t}"
                        
                        # Create strategy (RandomWalk by default, or UserInfluence if enabled)
                        base_strategy = build_strategy(
                            self.global_strategy.name if hasattr(self.global_strategy, 'name') else "random_walk",
                            start_price=self.config.start_price,
                            volatility=self.config.volatility,
                            drift=self.config.drift,
                            mean_strength=self.config.mean_reversion_strength,
                            circuit_limit=self.config.circuit_limit,
                        )
                        
                        if allow_influence:
                            st = UserInfluenceStrategy(base=base_strategy)
                        else:
                            st = base_strategy
                        
                        self.strategies[namespaced_ticker] = st
                        self.prices[namespaced_ticker] = self.config.start_price
                        if namespaced_ticker not in self.tickers:
                            self.tickers.append(namespaced_ticker)
                    
                    print(f"[sim] Launched simulated mode for {len(tickers)} tickers in comp {comp_id}")
                elif action == "set_pressure":
                    comp_id = payload.get("competitionId")
                    pressure = float(payload.get("pressure", 0.0))
                    if comp_id:
                        for key, st in self.strategies.items():
                            if key.startswith(f"C_{comp_id}_"):
                                if isinstance(st, UserInfluenceStrategy):
                                    st.set_pressure(pressure)
                    else:
                        if isinstance(self.global_strategy, UserInfluenceStrategy):
                            self.global_strategy.set_pressure(pressure)
                        for key, st in self.strategies.items():
                            if not key.startswith("C_") and isinstance(st, UserInfluenceStrategy):
                                st.set_pressure(pressure)
                elif action == "launch_competition_excel":
                    comp_id = payload.get("competitionId")
                    redis_key = payload.get("redisKey")
                    tickers = payload.get("tickers", [])
                    allow_influence = payload.get("allowInfluence", False)
                    import redis
                    r = redis.Redis(host="localhost", port=6379, db=0)
                    data_json = r.get(redis_key)
                    if data_json:
                        data = json.loads(data_json)
                        for t in tickers:
                            p_list = []
                            for row in data:
                                p_list.append(float(row.get(t, row.get(t.lower(), 100.0))))
                            st = ExcelStrategy(prices=p_list)
                            if allow_influence:
                                st = UserInfluenceStrategy(base=st)
                            namespaced_ticker = f"C_{comp_id}_{t}"
                            self.strategies[namespaced_ticker] = st
                            self.prices[namespaced_ticker] = p_list[0] if p_list else 100.0
                            if namespaced_ticker not in self.tickers:
                                self.tickers.append(namespaced_ticker)
                        print(f"[sim] Launched excel mode for {len(tickers)} tickers in comp {comp_id}")
            except Exception as exc:  # noqa: BLE001
                print(f"[sim] malformed control message: {exc}")

    def run(self) -> None:
        print(f"[sim] starting with config: {asdict(self.config)}")
        thread = threading.Thread(target=self._control_loop, daemon=True)
        thread.start()

        while self.running:
            now_ms = int(time.time() * 1000)
            for ticker in self.tickers:
                strategy = self.strategies.get(ticker, self.global_strategy)
                next_value = strategy.next_price(self.prices[ticker])
                self.prices[ticker] = next_value

                payload = {
                    "ticker": ticker,
                    "price": round(next_value, 4),
                    "volume": int(max(1, abs(next_value) * 2) % 1000 + 1),
                    "ts": now_ms,
                }

                self.producer.produce(
                    self.config.price_topic,
                    key=ticker.encode("utf-8"),
                    value=json.dumps(payload).encode("utf-8"),
                )

            self.producer.poll(0)
            time.sleep(self.config.tick_interval)

        self.shutdown()

    def shutdown(self) -> None:
        self.running = False
        self.producer.flush(5)
        self.control_consumer.close()
        print("[sim] shutdown complete")


def main() -> None:
    config = SimConfig.from_env()
    simulator = Simulator(config)

    def handle_signal(sig: int, _frame: Any) -> None:
        print(f"[sim] signal received: {sig}")
        simulator.running = False

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    simulator.run()


if __name__ == "__main__":
    main()
