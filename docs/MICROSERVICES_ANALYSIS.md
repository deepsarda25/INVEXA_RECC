# Microservices Architecture Analysis & Feasibility for Invexa

## Executive Summary

**Can Invexa be converted to microservices?** YES

**Should it be done now?** NO - Not for current course scope

**When should it be done?** After the refactoring is complete and stable (see REFACTORING_GUIDE.md)

---

## Part 1: Current Architecture Assessment

### Current State: Distributed Monolith

Invexa is NOT a traditional monolith. It already has several distributed components:

```
┌─────────────────────────────────────────────────┐
│           CURRENT ARCHITECTURE                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │   MONOLITHIC BACKEND (Node.js/Elysia)   │   │
│  │  - Routes: /auth, /orders, /portfolio   │   │
│  │  - Services: market, indexes, trades    │   │
│  │  - All sharing: DB, Redis, Kafka        │   │
│  └──────────────────────────────────────────┘   │
│              ↓                                   │
│  ┌────────────────────────────────┐             │
│  │   Kafka (Event Bus)            │             │
│  │  Topics: competitions, orders  │             │
│  └────────────────────────────────┘             │
│              ↓                                   │
│  ┌────────────────────────────────┐             │
│  │  Python Simulator (Separate)   │             │
│  │  Consumes: competition events  │             │
│  │  Produces: price ticks         │             │
│  └────────────────────────────────┘             │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │   Shared Infrastructure                  │   │
│  │  - TimescaleDB (data store)             │   │
│  │  - Redis (cache/sessions)               │   │
│  │  - Kafka (messaging)                    │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Components Analysis

| Component | Type | Responsibility | Scale |
|-----------|------|-----------------|-------|
| Backend API | Monolith | All routes + business logic | Single instance |
| Simulator | Microservice | Market simulation | Single instance |
| Workers | Async Tasks | Order execution, price ingestion | Multiple |
| Redis | Cache/Cache | Price cache, sessions, locks | Shared |
| TimescaleDB | Database | All persistent data | Shared |
| Kafka | Message Bus | Event propagation | Shared |

---

## Part 2: Microservices Decomposition Strategy

### Option 1: Minimal Decomposition (Recommended for Invexa)

Split into **3 microservices** while keeping it simple:

```
AUTHENTICATION SERVICE (Auth MS)
├── Responsibilities:
│   ├── User registration/login
│   ├── JWT token generation
│   ├── Role-based access control
│   └── Session management
├── Endpoints: /auth/*
├── Database Tables: users
├── Dependencies: Redis (session store), JWT library
└── Can scale independently

                ↓ authenticates via JWT

TRADING SERVICE (Core Trading MS)
├── Responsibilities:
│   ├── Order management
│   ├── Portfolio calculations
│   ├── Market data retrieval
│   ├── Holdings management
│   └── Stock research
├── Endpoints: /orders/*, /portfolio/*, /market/*, /indexes/*
├── Database Tables: orders, holdings, price_ticks
├── Dependencies: Auth Service, Kafka, Redis
└── Can scale independently

                ↓ manages competitions

COMPETITION SERVICE (Competitions MS)
├── Responsibilities:
│   ├── Competition CRUD
│   ├── Participant management
│   ├── Leaderboard rankings
│   ├── Transaction history
│   └── Admin events (strategy changes)
├── Endpoints: /competitions/*
├── Database Tables: competitions, competition_participants, competition_holdings
├── Dependencies: Auth Service, Trading Service, Kafka, Redis
└── Can scale independently

                ↓ produces events

SIMULATOR (Already separate)
├── Responsibilities:
│   ├── Market simulation
│   ├── Price tick generation
│   ├── Strategy algorithm execution
│   └── Competition event processing
└── Consumes: Kafka competition_events
```

### Option 2: Moderate Decomposition (5 Services)

For larger scale or different teams:

```
1. AUTH SERVICE
   - User management only
   
2. USER SERVICE  
   - User profiles
   - Preferences
   - Role management

3. TRADING SERVICE
   - Orders
   - Portfolio
   
4. MARKET DATA SERVICE
   - Live prices
   - Historical data
   - Stock research
   
5. COMPETITION SERVICE
   - Competitions
   - Leaderboards
   - Tournaments
```

### Option 3: Maximum Decomposition (7+ Services)

For enterprise scale:

```
1. AUTH SERVICE
2. USER SERVICE
3. ORDER SERVICE
4. PORTFOLIO SERVICE
5. MARKET DATA SERVICE
6. COMPETITION SERVICE
7. NOTIFICATION SERVICE
8. ANALYTICS SERVICE
```

---

## Part 3: Detailed Decomposition (Option 1)

### SERVICE 1: Authentication Microservice

#### Responsibilities
```
- User registration
- User login / JWT generation
- Token validation/refresh
- Role management (user, educator, admin)
- Session management
```

#### API Endpoints
```
POST   /auth/register      - Create new user
POST   /auth/login         - Get JWT token
POST   /auth/refresh       - Refresh token
POST   /auth/logout        - Invalidate session
GET    /auth/profile       - Get current user
PUT    /auth/profile       - Update profile
```

#### Data Schema
```sql
TABLE: users
- id (UUID primary key)
- username (VARCHAR unique)
- email (VARCHAR unique)
- password_hash (VARCHAR)
- virtual_balance (NUMERIC)
- role (user | educator | admin)
- created_at
- updated_at
```

#### Dependencies
- Redis (JWT blacklist, session tokens)
- TimescaleDB (user persistence)

#### Deployment
```dockerfile
# auth-service/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
EXPOSE 3001
CMD ["node", "src/index.ts"]
```

#### Environment Variables
```bash
JWT_SECRET=<random>
PORT=3001
DATABASE_URL=postgres://...
REDIS_URL=redis://redis:6379
```

---

### SERVICE 2: Trading Microservice

#### Responsibilities
```
- Place orders (market, limit, stop-loss)
- Execute pending orders
- Manage holdings
- Calculate portfolio value
- Fetch market data (live prices, historical)
- Stock research (profile, fundamentals)
```

#### API Endpoints
```
# Orders
POST   /orders             - Place new order
GET    /orders             - Get user's orders
PUT    /orders/:id         - Cancel order

# Portfolio
GET    /portfolio          - Get portfolio summary
GET    /portfolio/holdings - Get current holdings
GET    /portfolio/history  - Get order history

# Market Data
GET    /market/stocks      - Get all stocks
GET    /market/stocks/:ticker/price    - Get current price
GET    /market/stocks/:ticker/history  - Get price history
GET    /market/stocks/:ticker/profile  - Get stock profile
GET    /indexes            - Get market indexes
```

#### Data Schema
```sql
TABLE: orders
- id (UUID)
- user_id (UUID) -> users.id
- ticker (VARCHAR)
- type (market | limit | stop_loss)
- side (buy | sell)
- quantity (INTEGER)
- limit_price (NUMERIC nullable)
- status (pending | filled | cancelled)
- filled_price (NUMERIC nullable)
- created_at
- executed_at nullable

TABLE: holdings
- user_id (UUID) -> users.id
- ticker (VARCHAR)
- quantity (INTEGER)
- avg_cost (NUMERIC)
- updated_at
- PRIMARY KEY (user_id, ticker)

TABLE: price_ticks
- time (TIMESTAMP)
- ticker (VARCHAR)
- price (NUMERIC)
- volume (INTEGER)
- PRIMARY KEY (time, ticker)
```

#### Dependencies
- Auth Service (verify JWT, get user info)
- Redis (price cache, order validation)
- TimescaleDB (orders, holdings, price history)
- Kafka (publish order filled events)

#### Deployment
```dockerfile
# trading-service/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
EXPOSE 3002
CMD ["node", "src/index.ts"]
```

---

### SERVICE 3: Competition Microservice

#### Responsibilities
```
- Create/manage competitions
- Participant management
- Leaderboard calculations
- Stock configuration
- Transaction history
- Admin events (strategy changes)
- Bulk participant import
```

#### API Endpoints
```
# Competition Management
GET    /competitions             - List public competitions
GET    /competitions/hosted      - User's hosted competitions
GET    /competitions/joined      - User's joined competitions
POST   /competitions             - Create new competition
PUT    /competitions/:id         - Update competition
POST   /competitions/:id/join    - Join competition

# Leaderboard & Info
GET    /competitions/:id/leaderboard       - Get rankings
GET    /competitions/:id/dashboard         - Get competition dashboard
GET    /competitions/:id/stock-history/:ticker - Price history

# Management
POST   /competitions/:id/stock-config      - Configure stocks
POST   /competitions/:id/stock-data        - Upload Excel data
POST   /competitions/:id/participants-bulk - Bulk add participants
GET    /competitions/:id/transactions      - Transaction history

# Admin
PUT    /competitions/:id/event             - Trigger market event
```

#### Data Schema
```sql
TABLE: competitions
- id (UUID primary key)
- name (TEXT)
- start_balance (DECIMAL)
- is_public (BOOLEAN)
- join_code (VARCHAR unique)
- password (VARCHAR nullable)
- start_at (TIMESTAMP)
- end_at (TIMESTAMP)
- status (draft | active | ended)
- created_by (UUID) -> users.id
- stock_data_source (simulated | excel | live)
- stock_data_config (JSONB)
- allow_user_influence (BOOLEAN)
- created_at (TIMESTAMP)

TABLE: competition_participants
- competition_id (UUID) -> competitions.id
- user_id (UUID) -> users.id
- virtual_balance (NUMERIC)
- rank (INTEGER nullable)
- joined_at (TIMESTAMP)
- PRIMARY KEY (competition_id, user_id)

TABLE: competition_holdings
- competition_id (UUID)
- user_id (UUID)
- ticker (VARCHAR)
- quantity (INTEGER)
- avg_cost (NUMERIC)
- updated_at (TIMESTAMP)
- PRIMARY KEY (competition_id, user_id, ticker)
```

#### Service-to-Service Communication
```
Competition Service → Trading Service
- Verify user when joining competition
- Get user's portfolio for competition dashboard
- Execute orders within competition context

Competition Service → Auth Service
- Verify JWT tokens
- Get user roles for authorization
```

#### Dependencies
- Auth Service (JWT verification, user info)
- Trading Service (orders, portfolio data)
- Redis (leaderboard cache, join codes)
- TimescaleDB (competitions data)
- Kafka (publish competition events)

#### Deployment
```dockerfile
# competition-service/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
EXPOSE 3003
CMD ["node", "src/index.ts"]
```

---

## Part 4: Service Communication Architecture

### API Gateway Pattern

```
┌─────────────────────────────────────────┐
│         API Gateway / Load Balancer     │
│      (Kong, Nginx, AWS API Gateway)     │
├─────────────────────────────────────────┤
│ - Route requests to correct service     │
│ - Rate limiting                         │
│ - Request/response transformation       │
│ - Authentication (JWT validation)       │
│ - Logging/Monitoring                    │
└────────┬────────────────────────────────┘
         │
    ┌────┼────────────────────────────────┐
    │    │                                │
    ▼    ▼                                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Auth MS     │  │  Trading MS  │  │ Competition  │
│  :3001       │  │  :3002       │  │ MS :3003     │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                │                 │
       └────────────────┼─────────────────┘
                        │
                ┌───────┴────────┐
                │                │
             (HTTP or gRPC)   (HTTP or gRPC)
                │                │
           ┌────▼────┐      ┌────▼────┐
           │  Kafka  │      │ TimescaleDB
           │         │      │ + Redis
           └─────────┘      └─────────┘
```

### Service-to-Service Calls

**HTTP REST** (Recommended for simplicity):
```typescript
// Competition Service calling Trading Service
async function getPortfolio(userId: string, competitionId: string) {
  const response = await fetch(`http://trading-service:3002/portfolio`, {
    headers: {
      'Authorization': `Bearer ${serviceToken}`,
      'X-User-ID': userId,
      'X-Competition-ID': competitionId
    }
  });
  return response.json();
}
```

**gRPC** (For performance-critical paths):
```protobuf
service TradingService {
  rpc GetPortfolio (GetPortfolioRequest) returns (PortfolioResponse);
  rpc GetHoldings (GetHoldingsRequest) returns (HoldingsResponse);
}
```

**Async via Kafka** (For events):
```typescript
// Competition Service publishes event
await eventPublisher.publish("user_joined_competition", {
  competitionId,
  userId,
  virtualBalance: 10000,
});

// Trading Service (async consumer) updates internal state
consumer.subscribe({ topic: "competition_events" });
consumer.on("message", (msg) => {
  if (msg.type === "user_joined_competition") {
    updateCompetitionParticipant(msg.competitionId, msg.userId);
  }
});
```

---

## Part 5: Data Consistency Strategy

### Shared vs. Replicated Data

#### Shared (Single Source of Truth)
```
- Users table (Auth Service owns)
- Competitions table (Competition Service owns)
- Orders table (Trading Service owns)
- Price ticks table (shared read-only)
```

#### Replicated (Each Service has copy)
```
- User cache (Redis) - replicated from Auth Service
- Competition cache (Redis) - replicated from Competition Service
- Holdings snapshot - replicated locally for leaderboard calc
```

### Transaction Handling

**Option 1: Database Transactions (If using shared DB)**
```typescript
// All services share TimescaleDB
// Transactions within single DB work normally
BEGIN TRANSACTION;
  INSERT INTO orders ...
  UPDATE holdings ...
  INSERT INTO competition_holdings ...
COMMIT;
```

**Option 2: Saga Pattern (For distributed transactions)**
```
User joins competition:
1. Check user exists (Auth Service)
2. Get starting balance (Auth Service)
3. Create participant record (Competition Service) ← STEP 1
4. Initialize portfolio (Trading Service) ← STEP 2
5. Update leaderboard (Competition Service) ← STEP 3

If Step 2 fails:
- Compensation: Delete participant record
- Compensation: Publish "user_unjoin_competition" event
```

**Saga Implementation:**
```typescript
class JoinCompetitionSaga {
  async execute(userId: string, competitionId: string) {
    try {
      // Step 1
      const competition = await competitionService.getCompetition(competitionId);
      
      // Step 2
      await competitionService.addParticipant(userId, competitionId);
      
      // Step 3
      await tradingService.initializePortfolio(
        userId,
        competitionId,
        competition.startBalance
      );
      
      return { success: true };
    } catch (error) {
      // Compensate
      await competitionService.removeParticipant(userId, competitionId);
      throw error;
    }
  }
}
```

---

## Part 6: Deployment & DevOps

### Docker Compose (Local Development)

```yaml
version: '3.8'

services:
  api-gateway:
    image: nginx:alpine
    ports:
      - "8000:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - auth-service
      - trading-service
      - competition-service

  auth-service:
    build: ./services/auth
    environment:
      - PORT=3001
      - DATABASE_URL=postgresql://user:pass@postgres:5432/invexa
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=dev-secret
    depends_on:
      - postgres
      - redis

  trading-service:
    build: ./services/trading
    environment:
      - PORT=3002
      - DATABASE_URL=postgresql://user:pass@postgres:5432/invexa
      - REDIS_URL=redis://redis:6379
      - KAFKA_BROKERS=kafka:9092
      - AUTH_SERVICE_URL=http://auth-service:3001
    depends_on:
      - postgres
      - redis
      - kafka

  competition-service:
    build: ./services/competition
    environment:
      - PORT=3003
      - DATABASE_URL=postgresql://user:pass@postgres:5432/invexa
      - REDIS_URL=redis://redis:6379
      - KAFKA_BROKERS=kafka:9092
      - AUTH_SERVICE_URL=http://auth-service:3001
      - TRADING_SERVICE_URL=http://trading-service:3002
    depends_on:
      - postgres
      - redis
      - kafka

  postgres:
    image: timescale/timescaledb:latest-pg15
    environment:
      - POSTGRES_DB=invexa
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      - KAFKA_ZOOKEEPER_CONNECT=zookeeper:2181
      - KAFKA_BROKER_ID=1
      - KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka:9092
    depends_on:
      - zookeeper

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      - ZOOKEEPER_CLIENT_PORT=2181

  simulator:
    build: ./simulator
    environment:
      - KAFKA_BROKERS=kafka:9092
    depends_on:
      - kafka

volumes:
  postgres-data:
  redis-data:
```

### Kubernetes Deployment

```yaml
---
# Auth Service Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: auth-service
        image: invexa/auth-service:1.0.0
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "500m"
---
# Service
apiVersion: v1
kind: Service
metadata:
  name: auth-service
spec:
  selector:
    app: auth-service
  ports:
  - protocol: TCP
    port: 3001
    targetPort: 3001
  type: ClusterIP
```

---

## Part 7: Monitoring & Observability

### Distributed Tracing

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('competition-service');

async function joinCompetition(userId: string, competitionId: string) {
  const span = tracer.startSpan('joinCompetition');
  span.setAttributes({
    userId,
    competitionId,
  });

  try {
    const result = await competitionService.join(userId, competitionId);
    span.addEvent('success');
    return result;
  } catch (error) {
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
```

### Centralized Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  format: winston.format.json(),
  defaultMeta: {
    service: 'competition-service',
    environment: process.env.NODE_ENV,
  },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: '/var/log/competition-service.log',
    }),
  ],
});

logger.info('Competition created', {
  competitionId,
  userId,
  correlationId,
});
```

### Health Checks

```typescript
app.get('/health', (ctx) => {
  const health = {
    status: 'ok',
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      kafka: await checkKafka(),
    },
  };

  return health;
});
```

---

## Part 8: Migration Path

### Phase 1: Refactoring (Weeks 1-2)
Follow REFACTORING_GUIDE.md to extract services in monolith

### Phase 2: Preparation (Weeks 3-4)
- Extract each service into separate code directory
- Create Docker images
- Setup Docker Compose for local development
- Write service-to-service integration tests

### Phase 3: Gradual Rollout (Weeks 5-8)
- Deploy Auth Service separately
- Deploy Trading Service separately
- Deploy Competition Service separately
- Run all in parallel with API gateway

### Phase 4: Testing (Weeks 9-10)
- Full integration testing
- Load testing
- Chaos engineering (simulate failures)
- Monitor for 2 weeks

### Phase 5: Production (Week 11+)
- Blue-green deployment
- Gradual traffic migration
- Monitor continuously
- Rollback plan ready

---

## Part 9: Cost-Benefit Analysis

### Benefits of Microservices
✅ Independent scaling (Competition Service scales 10x, others scale 2x)
✅ Team autonomy (each service can be owned by one team)
✅ Faster deployment (no need to deploy entire system)
✅ Technology flexibility (each service can use different stack)
✅ Resilience (one service down doesn't crash entire system)
✅ Easier testing (smaller codebase per service)

### Costs/Complexity
❌ Operational complexity (more services to manage)
❌ Network latency (HTTP/gRPC calls between services)
❌ Data consistency challenges (distributed transactions)
❌ Monitoring complexity (need distributed tracing)
❌ Deployment complexity (need orchestration like Kubernetes)
❌ Initial development overhead (more work upfront)

### For Invexa Course Project
| Factor | Rating | Notes |
|--------|--------|-------|
| **Team Size** | 1-3 people | Small team, monolith easier |
| **Timeline** | 6 months | Reasonable for refactor → microservices |
| **Complexity** | Medium | Not enterprise-scale, but needs coordination |
| **Operations** | ⭐⭐⭐ | Requires Docker/Kubernetes knowledge |
| **Learning Value** | ⭐⭐⭐⭐⭐ | High - microservices is industry standard |

---

## Part 10: Recommendation

### For Course (Current Phase)

**DO:**
✅ Complete refactoring (REFACTORING_GUIDE.md)
✅ Make code microservice-ready (dependency injection, clear interfaces)
✅ Document the refactored architecture
✅ Get code review before deployment

**DON'T:**
❌ Don't split into separate services yet
❌ Don't add Kubernetes
❌ Don't add distributed tracing
❌ Don't add service mesh

**Why:** Premature optimization. Refactoring first makes eventual microservices migration trivial.


## Conclusion

Invexa CAN be converted to microservices. The refactored code provides an excellent foundation. However, the current phase should focus on:

1. ✅ Completing the refactoring (REFACTORING_GUIDE.md)
2. ✅ Making code DI-enabled and interface-driven
3. ✅ Deploying refactored monolith to production
4. ⏳ Planning microservices migration for Phase 2 (future)

This approach provides:
- **Immediate value:** Better code quality, easier maintenance
- **Future optionality:** Easy to migrate to microservices later
- **Learning value:** Understanding of enterprise architecture
- **Production readiness:** Scalable, maintainable codebase

