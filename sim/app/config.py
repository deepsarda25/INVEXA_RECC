from __future__ import annotations

import os
from dataclasses import dataclass


def _as_list(raw: str) -> list[str]:
    return [item.strip().upper() for item in raw.split(",") if item.strip()]


@dataclass(slots=True)
class SimConfig:
    kafka_brokers: str
    price_topic: str
    control_topic: str
    tick_interval: float
    tickers: list[str]
    start_price: float
    strategy: str
    volatility: float
    drift: float
    mean_reversion_strength: float
    circuit_limit: float

    @classmethod
    def from_env(cls) -> "SimConfig":
        return cls(
            kafka_brokers=os.getenv("SIM_KAFKA_BROKERS", "localhost:9094"),
            price_topic=os.getenv("SIM_PRICE_TOPIC", "price-ticks"),
            control_topic=os.getenv("SIM_CONTROL_TOPIC", "sim-control"),
            tick_interval=float(os.getenv("SIM_TICK_INTERVAL", "1.0")),
            tickers=_as_list(os.getenv("SIM_TICKERS", "FAKE,TSIM,NOVA,ALFA,ZENX")),
            start_price=float(os.getenv("SIM_START_PRICE", "100.0")),
            strategy=os.getenv("SIM_STRATEGY", "random_walk"),
            volatility=float(os.getenv("SIM_VOLATILITY", "0.02")),
            drift=float(os.getenv("SIM_DRIFT", "0.0005")),
            mean_reversion_strength=float(os.getenv("SIM_MEAN_REVERSION_STRENGTH", "0.08")),
            circuit_limit=float(os.getenv("SIM_CIRCUIT_LIMIT", "0.03")),
        )
