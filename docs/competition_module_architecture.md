# Competition Module Design Architecture & Patterns

This document outlines the architectural design, patterns, and technical implementation details of the Competition module.

## 1. Design Architecture

The Competition module follows a **Clean Architecture** / **Domain-Driven Design (DDD)** approach, ensuring a clear separation of concerns and high testability. It is structured into multiple layers:

### Layers Overview

| Layer | Responsibility | Key Files / Directories |
| :--- | :--- | :--- |
| **API / Controller Layer** | Handles HTTP requests, input validation (using Elysia/TypeBox), and response formatting. | `backend/src/modules/competitions/routes/` |
| **Domain / Service Layer** | Contains core business logic, validation rules, and domain entities. It is split using a **CQRS-lite** approach. | `backend/src/domain/competitions/services/` |
| **Data / Repository Layer** | Abstracts data persistence using the **Repository Pattern**. Interacts with PostgreSQL using a DB client. | `backend/src/data/repositories/` |
| **Infrastructure Layer** | External system integrations: **Kafka** for event streaming and **Redis** for caching. | `backend/src/lib/kafka`, `backend/src/lib/redis` |

### Infrastructure Components
- **Redis**: Used for real-time price caching and stock mapping (ticker anonymization).
- **Kafka**: Orchestrates background tasks like launching market simulations when a competition is configured.
- **PostgreSQL**: Stores persistent data for competitions, participants, holdings, and orders.

---

## 2. Design Patterns Used

### 1. Repository Pattern
Individual data access logic is encapsulated within the `CompetitionRepository`. This decouples the domain logic from the underlying database schema and SQL queries.
- **Benefit**: Allows swapping the database implementation or mocking during tests.

### 2. CQRS (Command Query Responsibility Segregation) Lite
The service layer is split into:
- **Command Services** (`CompetitionCommandService`): Handles state-changing operations (Create, Join, Update).
- **Query Services** (`CompetitionQueryService`): Optimized for data retrieval (Leaderboards, Transaction History, Joined Leagues).
- **Benefit**: Improves maintainability by keeping complex write logic separate from read-only views.

### 3. Dependency Inversion Principle (DIP)
Services depend on interfaces (e.g., `ICompetitionRepository`, `IEventPublisher`) rather than concrete implementations.
- **Benefit**: Reduces coupling and facilitates dependency injection.

### 4. Observer / Event-Driven Pattern
The application uses an `IEventPublisher` (backed by Kafka) to notify other modules of significant actions.
- **Example**: Creating a competition published an event that might trigger a simulation engine or notification service.

### 5. Adapter / Mapping Pattern
The `mapToCompetition` method in the repository converts database-level records (with snake_case) into clean domain objects (camelCase), acting as a translation layer.

### 6. Anonymous Ticker Pattern (Proxy/Mapping)
In the competition dashboard, real stock tickers are mapped to generic names like `STOCK1`, `STOCK2`. This mapping is stored in Redis.
- **Benefit**: Ensures fairness by hiding stock identities from participants while allowing organizers to see the real names.

---

## 3. Use Case Flows

### A. Competition Creation
1. **Request**: User submits competition details (Name, Balance, Timing, Privacy).
2. **Validation**: Elysia validates the input schema. `CompetitionCommandService` checks business rules.
3. **Identifier Generation**: A unique 6-digit alphanumeric `joinCode` is generated for easy sharing.
4. **Persistence**: The competition is saved via `CompetitionRepository.create`.
5. **Side Effects**: A `competition_created` event is published via Kafka.

### B. Joining a Competition
1. **Lookup**: The user provides either the Competition ID or the 6-digit `joinCode`.@
2. **Access Control**: The system checks if the competition is public or private (password verified if necessary).
3. **Participation**: If the user isn't already a member, they are added to `competition_participants` with the competition's `startBalance`.
4. **Notification**: A `user_joined_competition` event is emitted.

### C. Dashboard & Trading Flow
1. **Anonymization**: Upon loading the dashboard, the backend resolves the real tickers but serves them as generic `STOCK{N}` identifiers.
2. **Live Pricing**: The system performs a "waterfall" lookup for prices:
    - Check **Redis** for the latest cached price.
    - Fallback to the latest record in `price_ticks` table in **Postgres**.
3. **Holdings Integration**: The dashboard consolidates live prices with user-specific holdings to calculate real-time PnL and rankings.

### D. Stock Configuration (Admin)
1. **Config**: The organizer chooses a data source (**Simulated**, **Live**, or **Excel**).
2. **Excel Upload**: If Excel is used, the file is parsed, rows are stored in Redis (temporary), and a Kafka message triggers the simulation engine to use these specific trajectories.
3. **Isolation**: Every competition gets a unique ticker namespace (e.g., `C_{compID}_{ticker}`) to prevent trade pollution across different contests.
