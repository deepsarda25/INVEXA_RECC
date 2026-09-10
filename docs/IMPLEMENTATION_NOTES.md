# Invexa Implementation Notes (Features 1 & 4)

This document details the exact changes made to implement two core features of the Invexa platform as outlined in the `doc.md` and `invexa_plan_complete.html` files.

---

## Feature 1: Automated User Volume Influence (Supply & Demand Mechanics)

### The Goal
According to the original design, the **Market Simulation Engine** is supposed to use real-time user trading volume to influence short-term price changes. Net buy pressure should push prices up, and net sell pressure should push them down.

### What Was Implemented
1. **Created a Volume Aggregator Worker (`backend/src/workers/volumeAggregator.ts`):** 
   - Uses `setInterval` to run a background loop every 5 seconds.
   - Queries the TimescaleDB `orders` table to find all `filled` orders executed in the past 15 seconds.
   - Sums up the `quantity` for both `buy` and `sell` sides.
   - Calculates a global `net_pressure` multiplier strictly bound between `-1.0` and `1.0` using the formula: `(buyVol - sellVol) / totalVol`.
   - Flushes that `pressure` multiplier live to the Python simulator using the `sim.control` Kafka topic (`{"action": "set_pressure", "pressure": net_pressure}`).

2. **Hooked Up the Worker (`backend/src/workers/startWorkers.ts`):**
   - Imported and invoked `await startVolumeAggregator()` during backend startup (next to the other Kafka workers) ensure it continuously runs.
   - Wired up `stopVolumeAggregator()` to safely clear the interval on backend shutdown.

---

## Feature 4: Admin Event Trigger UI (Market Event Shocks)

### The Goal
The application proposal requires the ability to demonstrate market reactions through **Admin-triggered market shocks (e.g., circuit breakers or mean reversion events).**

### What Was Implemented
1. **Added Admin Capabilities to Backend (`backend/src/modules/competitions.ts`):**
   - Modified the `PUT /competitions/:id/event` route to forward *all* strategy changes (e.g., `circuit_breaker`, `mean_reversion`, `random_walk`) down to the Python simulator via the `sim.control` Kafka hook. Previously, this was hardcoded to only allow `circuit_breaker`.

2. **Created the Frontend Admin Dashboard (`frontend/src/components/AdminPanel.tsx`):**
   - Created a strict role-based panel that rejects standard users and only renders for users with `admin` or `educator` database roles.
   - Implemented interface payload buttons that instantly push actions to the backend:
     - 📉 **Trigger Circuit Breaker:** Crashes the simulation algorithm abruptly with a max daily cap (`type: "circuit_breaker", metadata: { max_pct: 0.1 }`).
     - 📈 **Trigger Mean Reversion:** Switches the Python engine to magnetic snapping behavior (`type: "mean_reversion"`). 
     - 🎲 **Restore Random Walk:** Returns the exchange to standard mode (`type: "random_walk"`).

3. **Wired the UI Layout (`frontend/src/App.tsx`):**
   - Integrated the `AdminPanel` module into application routing.
   - Activated the "Admin" button in the global side navigation layout (`Management` section) enabling conditional rendering of the panel based on the active tab state.
