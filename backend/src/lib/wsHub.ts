type SocketClient = {
  send: (payload: string) => void;
};

const priceClients = new Set<SocketClient>();
const personalClients = new Map<string, Set<SocketClient>>();

export function addPriceClient(client: SocketClient) {
  priceClients.add(client);
}

export function removePriceClient(client: SocketClient) {
  priceClients.delete(client);
  for (const clients of personalClients.values()) {
    clients.delete(client);
  }
}

export function bindPersonalClient(userId: string, client: SocketClient) {
  const existing = personalClients.get(userId) ?? new Set<SocketClient>();
  existing.add(client);
  personalClients.set(userId, existing);
}

export function unbindPersonalClient(userId: string, client: SocketClient) {
  const clients = personalClients.get(userId);
  if (!clients) return;
  clients.delete(client);
  if (clients.size === 0) {
    personalClients.delete(userId);
  }
}

export function broadcastPrice(payload: unknown) {
  const message = JSON.stringify({ event: "price", data: payload });
  for (const client of priceClients) {
    try {
      client.send(message);
    } catch {
      // Drop best-effort failures silently for disconnected sockets.
    }
  }
}

export function broadcastSystemEvent(payload: unknown) {
  const message = JSON.stringify({ event: "system_event", data: payload });
  for (const client of priceClients) {
    try {
      client.send(message);
    } catch {
      // Drop best-effort failures silently for disconnected sockets.
    }
  }
}

export function notifyUser(userId: string, payload: unknown) {
  const clients = personalClients.get(userId);
  if (!clients) return;

  const message = JSON.stringify({ event: "order-filled", data: payload });
  for (const client of clients) {
    try {
      client.send(message);
    } catch {
      // Drop best-effort failures silently for disconnected sockets.
    }
  }
}
