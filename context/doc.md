# Project Proposal: Invexa (Team 24)

**Invexa** is a simulated stock market platform designed to bridge the gap between financial theory and practice. It allows users to experiment with trading strategies in a risk-free, virtual environment.

---

## 1. Use Case & Significance
Beginners often struggle with market concepts like order placement and stop-loss due to real-world financial risk. Invexa addresses this by providing a safe, interactive, and educational environment.

*   **Target Users:**
    *   **Students/Beginners:** Learning market fundamentals and mechanics.
    *   **Educators:** Conducting trading competitions and demonstrating concepts.
    *   **Finance Enthusiasts:** Practicing investment decisions and simulating market shocks (e.g., circuit breakers).

---

## 2. Core Features
1.  **User Portfolio Management:** Account creation, portfolio maintenance, trade history, and P/L statistics.
2.  **Order Placement System:** Supports various order types (Market, Limit, Stop-Loss), validation, and matching based on prices.
3.  **Market Simulation Engine:** Uses configurable models (e.g., "Random Walk") combined with real-time user trading volume to influence short-term price changes.
4.  **Competition Mode:** Multi-user mode where participants start with equal capital to maximize profits; includes a leaderboard.
5.  **Event Simulation:** Admin-triggered market shocks (e.g., circuit breakers) to demonstrate market reactions.

---

## 3. Architecture & Tech Stack
### Tentative Tech Stack
*   **Frontend:** React (Dashboard/Interface)
*   **Backend:** Node.js + Express (API Services)
*   **Simulation Engine:** Python (Microservice)
*   **Database:** MongoDB

### Design Patterns
*   **Factory Pattern:** For creating diverse order types.
*   **Observer Pattern:** For notifying UI and portfolio services of price or trade updates.
*   **Strategy Pattern:** For supporting different market simulation algorithms.
*   **Command Pattern:** To represent buy/sell actions as executable commands.

---

## 4. Project Timeline
| Phase | Dates | Key Activities |
| :--- | :--- | :--- |
| **Research & Planning** | Mar 17–20 | Market research, API exploration, learning market actions. |
| **System Design** | Mar 21–26 | Architecture definition and design pattern selection. |
| **Development** | Mar 27–Apr 12 | Implementation of order placement, portfolio, and simulation. |
| **Testing & Integration** | Apr 13–17 | System testing and component integration. |
| **Finalization** | Apr 18–21 | Bug fixes, documentation, and deployment. |

---

## 5. Domain
Invexa operates at the intersection of **Finance** and **Education**, focusing on teaching market mechanisms through simulation and competitive engagement.