import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  gender: "male" | "female";
  avatarUrl: string | null;
  avatarPreset: string | null;
  credits: number;
  isPremium: boolean;
  isGodMode: boolean;
  isAdmin: boolean;
  emailVerified: boolean;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string, rememberMe?: boolean) => Promise<AuthUser>;
  register: (data: RegisterInput) => Promise<void>;
  verifyOtp: (email: string, otpCode: string) => Promise<void>;
  resendOtp: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateGender: (gender: "male" | "female") => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  updateAvatar: (avatarUrl: string | null, avatarPreset?: string | null) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  gender: "male" | "female";
  avatarUrl?: string | null;
  avatarPreset?: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user ?? data ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setIsLoading(false));
  }, [refreshUser]);

  const login = async (identifier: string, password: string, rememberMe = false) => {
    const res = await apiRequest("POST", "/api/auth/login", {
      identifier,
      password,
      rememberMe,
    });
    const data = await res.json();
    const loggedIn: AuthUser = data.user ?? data;
    setUser(loggedIn);
    return loggedIn;
  };

  const register = async (data: RegisterInput) => {
    await apiRequest("POST", "/api/auth/register", data);
  };

  const verifyOtp = async (email: string, otpCode: string) => {
    await apiRequest("POST", "/api/auth/verify-otp", { email, otpCode });
    await refreshUser();
  };

  const resendOtp = async (email: string) => {
    await apiRequest("POST", "/api/auth/resend-otp", { email });
  };

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } finally {
      setUser(null);
    }
  };

  const updateGender = async (gender: "male" | "female") => {
    await apiRequest("PATCH", "/api/profile/gender", { gender });
    setUser((prev) => (prev ? { ...prev, gender } : prev));
  };

  const updateDisplayName = async (displayName: string) => {
    await apiRequest("PATCH", "/api/profile/display-name", { displayName });
    setUser((prev) => (prev ? { ...prev, displayName } : prev));
  };

  const updateAvatar = async (avatarUrl: string | null, avatarPreset?: string | null) => {
    await apiRequest("PATCH", "/api/auth/avatar", { avatarUrl, avatarPreset });
    setUser((prev) =>
      prev ? { ...prev, avatarUrl, avatarPreset: avatarPreset ?? prev.avatarPreset } : prev,
    );
  };

  const deleteAccount = async () => {
    await apiRequest("DELETE", "/api/profile/account");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        verifyOtp,
        resendOtp,
        logout,
        refreshUser,
        updateGender,
        updateDisplayName,
        updateAvatar,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth, AuthProvider içinde kullanılmalı");
  return ctx;
}
