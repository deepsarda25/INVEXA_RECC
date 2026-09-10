from __future__ import annotations

import random
from dataclasses import dataclass


class BaseStrategy:
    name = "base"

    def next_price(self, current: float) -> float:
        return max(0.01, current)


@dataclass(slots=True)
class RandomWalkStrategy(BaseStrategy):
    volatility: float = 0.02
    drift: float = 0.0005

    name = "random_walk"

    def next_price(self, current: float) -> float:
        delta = random.gauss(self.drift, self.volatility)
        return max(0.01, current * (1 + delta))


@dataclass(slots=True)
class MeanReversionStrategy(BaseStrategy):
    target_mean: float = 100.0
    strength: float = 0.08
    noise_sigma: float = 0.01

    name = "mean_reversion"

    def next_price(self, current: float) -> float:
        pull = self.strength * ((self.target_mean - current) / max(self.target_mean, 0.01))
        noise = random.gauss(0.0, self.noise_sigma)
        return max(0.01, current * (1 + pull + noise))


@dataclass(slots=True)
class CircuitBreakerStrategy(BaseStrategy):
    volatility: float = 0.01
    drift: float = 0.0
    max_pct: float = 0.03

    name = "circuit_breaker"

    def next_price(self, current: float) -> float:
        raw_delta = random.gauss(self.drift, self.volatility)
        clamped = max(-self.max_pct, min(self.max_pct, raw_delta))
        return max(0.01, current * (1 + clamped))


class ExcelStrategy(BaseStrategy):
    name = "excel"

    def __init__(self, prices: list[float]):
        self.prices = prices
        self.current_idx = 0

    def next_price(self, current: float) -> float:
        if self.current_idx < len(self.prices):
            p = self.prices[self.current_idx]
            self.current_idx += 1
            return max(0.01, p)
        return current


@dataclass(slots=True)
class UserInfluenceStrategy(BaseStrategy):
    base: BaseStrategy
    impact_factor: float = 0.15
    net_pressure: float = 0.0

    name = "user_influence"

    def set_pressure(self, pressure: float) -> None:
        self.net_pressure = max(-1.0, min(1.0, pressure))

    def next_price(self, current: float) -> float:
        base_price = self.base.next_price(current)
        return max(0.01, base_price * (1 + self.net_pressure * self.impact_factor))


def build_strategy(name: str, *, start_price: float, volatility: float, drift: float, mean_strength: float, circuit_limit: float) -> BaseStrategy:
    key = name.strip().lower()
    if key == "mean_reversion":
        return MeanReversionStrategy(target_mean=start_price, strength=mean_strength)
    if key == "circuit_breaker":
        return CircuitBreakerStrategy(volatility=volatility * 0.5, drift=drift, max_pct=circuit_limit)
    if key == "user_influence":
        return UserInfluenceStrategy(base=RandomWalkStrategy(volatility=volatility, drift=drift))
    return RandomWalkStrategy(volatility=volatility, drift=drift)
