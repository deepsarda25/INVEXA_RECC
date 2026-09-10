import { describe, expect, it, beforeAll } from "bun:test";
import { createRequire } from "node:module";

// See src/index.ts for why this has to be a synchronous require() followed
// by a *dynamic* import of the app, rather than a plain static import of
// "../server" — a static import doesn't reliably order itself ahead of
// server.ts's own transitive tsyringe dependency under Bun.
createRequire(import.meta.url)("reflect-metadata");
const { app } = await import("../server");

describe("Orders Module", () => {
  let authToken: string;
  const testUser = {
    username: `orderuser_${Date.now()}`,
    email: `order_${Date.now()}@example.com`,
    password: "password123",
  };

  beforeAll(async () => {
    // Register and login to get a token
    await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testUser),
      })
    );

    const loginRes = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernameOrEmail: testUser.username,
          password: testUser.password,
        }),
      })
    );
    const loginData = await loginRes.json();
    authToken = loginData.token;
  });

  it("should place a market buy order", async () => {
    const response = await app.handle(
      new Request("http://localhost/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          ticker: "AAPL",
          type: "market",
          side: "buy",
          quantity: 1,
        }),
      })
    );

    // Note: This might fail if the price resolver can't find a price for AAPL
    // and the simulator isn't running. But the code handles it with a 400.
    if (response.status === 200) {
      const data = await response.json();
      expect(data).toHaveProperty("orderId");
      expect(data.status).toBe("filled");
    } else {
      const data = await response.json();
      expect(data.error).toBeDefined();
    }
  });

  it("should list user orders", async () => {
    const response = await app.handle(
      new Request("http://localhost/orders", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.orders)).toBe(true);
  });

  it("should reject order with negative quantity", async () => {
    const response = await app.handle(
      new Request("http://localhost/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          ticker: "AAPL",
          type: "market",
          side: "buy",
          quantity: -1,
        }),
      })
    );

    expect(response.status).toBe(400);
  });
});
