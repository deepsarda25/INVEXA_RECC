# Stock Research Flow: Sequence of Processes

## Overview
The Stock Research system lets users input a stock ticker (e.g., \RELIANCE.NS\) and visualize its real-time history and fundamental market data. The feature spans across the frontend React components, the backend API endpoints, the Redis cache proxy layer, and the external data adapter mapping to Yahoo Finance.

## Logical Flow & Process Sequence

### 1. User Interaction (Frontend)
1. **Navigation:** The user clicks the **"Asset Research"** tab. The React \App.tsx\ detects the tab state change (\ctiveTab === "research"\) and mounts the \<StockResearch>\ component.
2. **Input Query:** The user types a ticker symbol and submits the form mapping to the local \	icker\ state.
3. **Data Fetching Initiation:** The \useQuery\ hooks from \@tanstack/react-query\ immediately dispatch two separate concurrent HTTP GET requests to the backend:
    - \GET /stocks/RELIANCE.NS/history?range=6mo\
    - \GET /stocks/RELIANCE.NS/profile\

### 2. API Routing & The Cache Proxy (Backend)
1. **Endpoint Resolution:** Elysia.js router catches the request in \modules/market.ts\.
2. **Key Normalization:** The input symbol undergoes uppercase normalization against the \	ickerSymbols.ts\ logic.
3. **Cache Proxy Pattern Interception:**
    - The server immediately queries the local **Redis Cache** (e.g., checking \profile:RELIANCE.NS\).
    - *Cache Hit (Fast Path):* If data exists, it is parsed and returned immediately with a \source: "redis"\ tag attached. The rest of the workflow is bypassed.
    - *Cache Miss (Slow Path):* If data is missing or TTL expired, the request is forwarded to the Adapter layer.

### 3. External API Communication (Adapter Pattern)
1. **Standardizing the Call:** The \marketAdapter\ (an instance of the \IMarketDataAdapter\ interface) receives the abstracted network request.
2. **Yahoo Fetching:** The concrete \YahooFinanceAdapter\ translates the standardized parameters into the shape \yahoo-finance2\ requires (e.g., fetching the \ssetProfile\ and \summaryDetail\ modules).
3. **Data Uniformity (Facade mapping):** Instead of passing Yahoo's deeply nested response up the chain, the Adapter extracts only the needed primitives (market cap, peRatio, high/low, description) into a clean, flat \ProfileResponse\ object.

### 4. Stateful Return & UI Reactivity
1. **Cache Updating:** The backend caches the Adapter's clean response in Redis using a TTL (e.g., 24 hours of cache lifetime for static structural data).
2. **Response Transport:** The API replies to the frontend with the JSON payload.
3. **Chart Rendering:** 
   - \eact-query\ updates the frontend cache. 
   - The \StockResearch\ component forces a re-render.
   - The \<AreaChart>\ component processes the \history\ points.
4. **Observer Injection (Live Data merging):** The user's websocket active subscription updates the local \prices[ticker]\ Zustand state in the background. The chart automatically overrides the right-most tip of the chart element with the living continuous price for instant responsiveness.

## Applied Design Patterns

- **Cache Proxy Pattern:** Sit in front of the API calls in \market.ts\. Validates caching structures natively skipping network delays.
- **Adapter Pattern:** Defines \IMarketDataAdapter\ protecting the rest of the application from the underlying dependencies of \yahoo-finance2\.
- **Observer Pattern:** Zustand explicitly binds to Websockets \prices\ which visually feeds the live UI element overriding historical charts effortlessly.
