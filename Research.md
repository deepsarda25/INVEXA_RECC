# Derivative Features & Inspiration Report: Invexa

This report outlines the conceptual lineage of the features implemented in **Invexa**, mapping them to established industry solutions and platforms that provided the blueprints for our trading, simulation, and competition modules.

---

## 📈 1. Trading & Visualization
*How we visualize the market and enable user interaction.*

> [!NOTE]
> Our core trading interface is designed to emulate the "Pro-sumer" experience—balancing the depth of professional tools with the accessibility of retail apps.

### Primary Inspirations:
1. **[TradingView](https://www.tradingview.com/)**
   - **Feature Derivation**: The implementation of high-fidelity price graphs, OHLCV (Open, High, Low, Close, Volume) data handling, and the real-time "ticker" flow.
   - **Connection**: Our Redis-backed live price cache mirrors the low-latency websocket architecture used by TradingView for sub-second updates.

2. **[Zerodha / Kite](https://kite.zerodha.com/)**
   - **Feature Derivation**: The simplified Order Management System (OMS).
   - **Connection**: Features like the "Market Watch" list, the clean separation of "Holdings" vs "Positions," and the split between Market and Limit orders are direct nods to the Kite interface.

3. **[Robinhood](https://robinhood.com/)**
   - **Feature Derivation**: The "Virtual Balance" and frictionless paper trading onboarding.
   - **Connection**: The UI's focus on "Total Portfolio Value" and real-time P&L changes draws from the gamified, mobile-first approach of Robinhood.

---

## 🕹️ 2. Simulation & Backtesting
*The engine driving our "Fake" market.*

> [!TIP]
> Our simulation engine isn't just a random number generator; it's a "Strategy-Aware" system that allows for Reproducible Market States.

### Primary Inspirations:
1. **[Investopedia Stock Market Simulator](https://www.investopedia.com/simulator/)**
   - **Feature Derivation**: The educational backbone of the platform.
   - **Connection**: The concept of competing with a fixed virtual amount in an "adult playground" for finance was pioneered by Investopedia.

2. **[MarketWatch Virtual Stock Exchange](https://www.marketwatch.com/game)**
   - **Feature Derivation**: Customizable competition parameters.
   - **Connection**: Professional algorithmic traders use QuantConnect to "backtest" strategies on historical data. We adapted this for *competitive* use—allowing users to trade through historic events (like the 2008 crash) in real-time. (not sure if we will be able to develop this thing by the end of the submission)

---

## 🏆 3. Competitions & Gamification
*How we turn trading into a sport.*

> [!IMPORTANT]
> The Competition module is the "Secret Sauce" of Invexa, transforming a solo trading experience into a multi-player arena.

### Primary Inspirations:
1. **[Codeforces](https://codeforces.com/)**
   - **Feature Derivation**: Competitive Ratings and Virtual Contest Dynamics.
   - **Connection**:
     - **Rating System**: The primary inspiration from Codeforces is the "User Rating" system (ELO-based or similar), where participants are ranked based on their performance across multiple contests.
     - **Contest-Virtual Balance**: We've adapted the concept of "Virtual Participation" and "Contest Standing." In Invexa, users trade with a dedicated "Contest Balance" that is isolated from their main portfolio, allowing for high-stakes competition without risk.
     - **The "Flex" Factor**: Much like Codeforces users showcase their "Grandmaster" or "Specialist" tags, Invexa is built for users to showcase their portfolio growth and ranking within a specific time-bound arena. It's about the social prestige of being a "Top Trader."

2. **[Kaggle](https://www.kaggle.com/)**
   - **Feature Derivation**: Leaderboard Progression and Private/Public Splits.
   - **Connection**: Just as Kaggle has a "Public Leaderboard" (during the contest) and a "Private Leaderboard" (final results), our competition module provides real-time ranking updates with a "Final Reveal" phase.

3. **[HackerRank](https://www.hackerrank.com/)**
   - **Feature Derivation**: Bulk Participant Management & Kafka-driven Registration.
   - **Connection**: The ability for "Organizers" to upload bulk student lists and manage large-scale contests reliably (using our Kafka-based registration worker) follows the enterprise contest management patterns of HackerRank.
   (Not sure if we will be able to develop this thing by the end of the submission)
---

## 🛠️ Summary of Derivation
| Our Feature | Inspired By | Why? |
| :--- | :--- | :--- |
| **Live Price Ticks** | TradingView | Industry standard for chart reliability. |
| **Historic Replay Mode** | QuantConnect | Enables "Time Travel" trading. |
| **Stock Anonymization** | Codeforces/Kaggle | Encourages pure technical analysis over news-bias. |
| **Join Codes** | Contest Platforms | Frictionless private league creation. |
| **User Ratings** | Codeforces | Long-term tracking of trading skill. |
| **Virtual Contest Balance** | Codeforces | Isolated "flexing" arena for contests. |
| **Excel Price Import** | Excel/Google Sheets | Power users want to "play god" with market data. |
| **Bulk Registration** | HackerRank | Optimized for educational/college-level events. |
