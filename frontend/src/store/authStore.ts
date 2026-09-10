import { create } from "zustand";
import { apiFetch } from "../api/client";
import { loginWithBiometric } from "../utils/webauthn";

type User = {
  id: string;
  username: string;
  email: string;
  role: "user" | "educator" | "admin";
  virtualBalance: string;
};

type AuthState = {
  token: string | null;
  user: User | null;
  loading: boolean;
  setToken: (token: string | null) => void;
  login: (input: { usernameOrEmail: string; password?: string; accessKey?: string }) => Promise<void>;
  loginBiometric: (usernameOrEmail: string) => Promise<void>;
  register: (input: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
    accessKey: string;
    confirmAccessKey: string;
    role?: "user" | "educator";
  }) => Promise<void>;
  logout: () => Promise<void>;
  updateBalance: (virtualBalance: string) => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem("invexa-token"),
  user: null,
  loading: false,
  setToken: (token) => {
    if (token) {
      localStorage.setItem("invexa-token", token);
    } else {
      localStorage.removeItem("invexa-token");
    }
    set({ token });
  },
  login: async ({ usernameOrEmail, password, accessKey }) => {
    set({ loading: true });
    try {
      const data = await apiFetch<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ usernameOrEmail, password, accessKey })
      });
      get().setToken(data.token);
      set({ user: data.user });
    } finally {
      set({ loading: false });
    }
  },
  loginBiometric: async (usernameOrEmail) => {
    set({ loading: true });
    try {
      const data = await loginWithBiometric(usernameOrEmail);
      get().setToken(data.token);
      set({ user: data.user as User });
    } finally {
      set({ loading: false });
    }
  },
  register: async ({ username, email, password, confirmPassword, accessKey, confirmAccessKey, role }) => {
    set({ loading: true });
    try {
      const data = await apiFetch<{ token: string; user: User }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, email, password, confirmPassword, accessKey, confirmAccessKey, role })
      });
      get().setToken(data.token);
      set({ user: data.user });
    } finally {
      set({ loading: false });
    }
  },
  logout: async () => {
    const token = get().token;
    if (token) {
      await apiFetch("/auth/logout", { method: "POST" }, token);
    }
    get().setToken(null);
    set({ user: null });
  },
  updateBalance: (virtualBalance) => {
    const current = get().user;
    if (current) {
      set({ user: { ...current, virtualBalance } });
    }
  }
}));
