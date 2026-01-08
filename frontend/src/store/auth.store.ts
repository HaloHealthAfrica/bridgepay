import { create } from "zustand";
import { authAPI } from "../services/api";

type User = {
  id: string;
  email: string;
  phone: string;
  name: string;
  role: string;
  kycStatus: string;
  twoFactorEnabled?: boolean;
};

type AuthState = {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isBootstrapping: boolean;

  setTokens: (accessToken: string, refreshToken: string) => void;
  clear: () => void;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string, twoFactorCode?: string) => Promise<"ok" | "2fa_required">;
  register: (payload: { email: string; phone: string; password: string; name: string; role?: string }) => Promise<void>;
  logout: () => Promise<void>;
};

function persistTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem("bridge_access_token", accessToken);
  localStorage.setItem("bridge_refresh_token", refreshToken);
}

function clearPersistedTokens() {
  localStorage.removeItem("bridge_access_token");
  localStorage.removeItem("bridge_refresh_token");
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: localStorage.getItem("bridge_access_token"),
  refreshToken: localStorage.getItem("bridge_refresh_token"),
  isBootstrapping: true,

  setTokens: (accessToken, refreshToken) => {
    persistTokens(accessToken, refreshToken);
    set({ accessToken, refreshToken });
  },

  clear: () => {
    clearPersistedTokens();
    set({ user: null, accessToken: null, refreshToken: null });
  },

  bootstrap: async () => {
    try {
      const { accessToken } = get();
      if (!accessToken) return;
      const me = await authAPI.me();
      set({ user: me.data.data.user });
    } catch {
      // ignore; user may not be logged in
    } finally {
      set({ isBootstrapping: false });
    }
  },

  login: async (email, password, twoFactorCode) => {
    const res = await authAPI.login({ email, password, twoFactorCode });
    if (res.data.requiresTwoFactor) return "2fa_required";

    const { accessToken, refreshToken, user } = res.data.data;
    persistTokens(accessToken, refreshToken);
    set({ accessToken, refreshToken, user, isBootstrapping: false });
    return "ok";
  },

  register: async (payload) => {
    const res = await authAPI.register(payload);
    const { accessToken, refreshToken, user } = res.data.data;
    persistTokens(accessToken, refreshToken);
    set({ accessToken, refreshToken, user, isBootstrapping: false });
  },

  logout: async () => {
    try {
      await authAPI.logout();
    } catch {
      // ignore
    } finally {
      get().clear();
    }
  },
}));


