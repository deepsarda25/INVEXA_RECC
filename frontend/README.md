# Frontend Overview

This document provides an overview of the frontend architecture, components, and features of the application. The frontend is built with React and TypeScript, using Vite as a build tool.

## Folder Structure

The `frontend/src` directory is organized as follows:

-   `src/`: Contains all the frontend source code.
    -   `api/`: Handles communication with the backend API.
        -   `client.ts`: The API client for making requests to the backend.
    -   `components/`: Contains reusable React components.
    -   `hooks/`: Custom React hooks for managing state and side effects.
        -   `usePriceSocket.ts`: A hook for managing the WebSocket connection for real-time price updates.
    -   `store/`: Zustand stores for global state management.
        -   `authStore.ts`: Manages authentication state (e.g., user tokens).
        -   `marketStore.ts`: Manages market-related state (e.g., prices).
    -   `App.tsx`: The main application component, which sets up routing and layout.
    -   `main.tsx`: The entry point of the application.
    -   `styles.css`: Global CSS styles.

## Components

The `src/components` directory includes the following components:

-   `AdminPanel.tsx`: A component for administrative functionalities.
-   `AuthPage.tsx`: The user authentication page for login and signup.
-   `CompetitionBoard.tsx`: Displays a leaderboard or view for trading competitions.
-   `IndexTicker.tsx`: A scrolling ticker for displaying market indexes.
-   `OrderForm.tsx`: A form for placing buy and sell orders.
-   `OrderHistory.tsx`: A table or list that shows the user's past orders.
-   `PortfolioCard.tsx`: A card that summarizes the user's portfolio, including holdings and profit/loss.
-   `PriceTable.tsx`: A table that displays real-time prices of stocks.
-   `ProfilePanel.tsx`: A panel for displaying and editing user profile information.

## Dashboard Features

The main dashboard provides the following features:

-   **Real-time Price Updates**: The `PriceTable` and `IndexTicker` components provide real-time updates on stock prices and market indexes.
-   **Portfolio Management**: The `PortfolioCard` gives a quick overview of the user's holdings and performance.
-   **Order Placement**: Users can place buy or sell orders through the `OrderForm`.
-   **Order History**: The `OrderHistory` component allows users to view their past transactions.
-   **User Authentication**: The `AuthPage` provides a secure way for users to log in and sign up.
-   **Competitions**: The `CompetitionBoard` shows rankings and information related to trading competitions.
-   **User Profile**: The `ProfilePanel` allows users to manage their profile information.
-   **Admin Capabilities**: The `AdminPanel` provides access to administrative features for authorized users.
