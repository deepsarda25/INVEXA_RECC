# Project Overview: FAKE-SE

**Invexa** is a stock exchange simulator designed to bridge the gap between theoretical finance and practical trading. It provides a risk-free, event-driven environment tailored for students and educators.

---

## Key Use Cases
*   **Risk-Free Financial Sandbox:** An interactive environment for beginners to master complex order types (Limit, Market, Stop-Loss) and market mechanisms without real-world financial exposure.
*   **Dynamic Market Simulation Engine:** A dual-driver price model that combines algorithmic "Random Walk" fluctuations with real-time user trading volume to simulate authentic supply and demand.
*   **Educational Competition Hub:** A multi-tenant platform for educators to host trading "leagues" with synchronized starting conditions and real-time leaderboards.
*   **End-to-End Portfolio Analytics:** Automated tracking and persistence of trade history, profit/loss (P/L) statistics, and holding valuations through a centralized, layered architecture.
*   **Volatility & Event Testing:** Admins can host events to trigger market shocks (e.g., 'circuit breakers') to simulate complex market situations.

---

## Requirements

### Functional Requirements
*   **Account Management:** Support for user registration, login, and initialization of every account with a fixed virtual balance (e.g., 10k).
*   **Order Validation:** Logic to confirm and complete trades while ensuring "buy" orders never exceed available cash and "sell" orders never exceed current holdings.
*   **Price Update Frequency:** The Market Simulation Engine must continuously generate and broadcast synthetic stock price data to all connected clients.
*   **Dynamic P/L Calculation:** The system shall recalculate the total portfolio value and Profit/Loss (P/L) whenever a new price update or trade confirmation is received.

### Non-Functional Requirements
*   **Usability:** The user interface shall be designed such that a user can complete an order within 3 to 5 clicks from the main dashboard.
*   **Reliability:** 
    *   The database must ensure high durability (>90%) of records.
    *   In the event of a system restart, the portfolio state must be updated to the latest value within 5 seconds.
*   **Scalability:** The backend should maintain a stable response time (<1–2 seconds) while supporting approximately 100 concurrent users, particularly during competitions.
*   **Latency:** The end-to-end delay between the Simulation Engine generating a price and the Web Dashboard displaying it must not exceed 2 seconds.