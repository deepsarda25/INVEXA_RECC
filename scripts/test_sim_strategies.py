import unittest
import random
import sys
import os

# Add sim directory to sys.path to import strategies
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'sim'))

from app.strategies import (
    RandomWalkStrategy,
    MeanReversionStrategy,
    CircuitBreakerStrategy,
    ExcelStrategy,
    UserInfluenceStrategy
)

class TestStrategies(unittest.TestCase):
    def test_random_walk(self):
        strategy = RandomWalkStrategy(volatility=0.0, drift=0.1)
        price = 100.0
        # With 0 volatility and 0.1 drift, next price should be 100 * (1 + 0.1) = 110
        next_price = strategy.next_price(price)
        self.assertAlmostEqual(next_price, 110.0)

    def test_mean_reversion(self):
        strategy = MeanReversionStrategy(target_mean=100.0, strength=1.0, noise_sigma=0.0)
        # Price is 50, pull = 1.0 * (100 - 50)/100 = 0.5
        # next_price = 50 * (1 + 0.5) = 75
        price = 50.0
        next_price = strategy.next_price(price)
        self.assertAlmostEqual(next_price, 75.0)

    def test_circuit_breaker(self):
        # max_pct = 0.05
        strategy = CircuitBreakerStrategy(volatility=1.0, drift=1.0, max_pct=0.05)
        price = 100.0
        # Even with high drift/volatility, change should be clamped to 5%
        next_price = strategy.next_price(price)
        self.assertLessEqual(next_price, 105.0)
        self.assertGreaterEqual(next_price, 95.0)

    def test_excel_strategy(self):
        prices = [10.0, 20.0, 30.0]
        strategy = ExcelStrategy(prices=prices)
        self.assertEqual(strategy.next_price(100), 10.0)
        self.assertEqual(strategy.next_price(10), 20.0)
        self.assertEqual(strategy.next_price(20), 30.0)
        # Should stay at last price or return current if exhausted
        self.assertEqual(strategy.next_price(30), 30.0)

    def test_user_influence(self):
        base = RandomWalkStrategy(volatility=0.0, drift=0.0)
        strategy = UserInfluenceStrategy(base=base, impact_factor=0.1)
        strategy.set_pressure(1.0)
        price = 100.0
        # base_price = 100
        # next_price = 100 * (1 + 1.0 * 0.1) = 110
        self.assertAlmostEqual(strategy.next_price(price), 110.0)

if __name__ == '__main__':
    unittest.main()
