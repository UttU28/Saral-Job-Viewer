import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  changePassword,
  fetchCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  updateProfileName,
  type AuthResponse,
} from "@/lib/api";
import {
  clearAuthState,
  readAuthToken,
  readAuthUser,
  readSessionProfile,
  writeAuthToken,
  writeAuthUser,
  writeSessionProfile,
  type AuthUser,
  type SessionProfile,
} from "@/lib/authStorage";

type AuthContextValue = {
  isAuthenticated: boolean;
  isHydrating: boolean;
  user: AuthUser | null;
  sessionProfile: SessionProfile | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateUserName: (name: string) => Promise<void>;
  updateSessionProfile: (nextProfile: SessionProfile) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = new Set<string>(["/login", "/register"]);

function applyAuthResponse(value: AuthResponse) {
  writeAuthToken(value.token);
  writeAuthUser(value.user);
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<AuthUser | null>(readAuthUser());
  const [sessionProfile, setSessionProfile] = useState<SessionProfile | null>(readSessionProfile());
  const [isHydrating, setIsHydrating] = useState(true);
  const [location, navigate] = useLocation();

  useEffect(() => {
    const hydrate = async () => {
      const token = readAuthToken();
      if (!token) {
        clearAuthState();
        setUser(null);
        setIsHydrating(false);
        if (!PUBLIC_PATHS.has(location)) navigate("/login");
        return;
      }
      try {
        const me = await fetchCurrentUser();
        writeAuthUser(me.user);
        setUser(me.user);
        if (PUBLIC_PATHS.has(location)) navigate("/");
      } catch {
        clearAuthState();
        setUser(null);
        if (!PUBLIC_PATHS.has(location)) navigate("/login");
      } finally {
        setIsHydrating(false);
      }
    };
    void hydrate();
    // hydrate only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: Boolean(user),
      isHydrating,
      user,
      sessionProfile,
      login: async (email: string, password: string) => {
        const res = await loginUser(email, password);
        applyAuthResponse(res);
        const nextProfile = {
          name: res.user.name,
          email: email.trim(),
          password,
        };
        writeSessionProfile(nextProfile);
        setSessionProfile(nextProfile);
        setUser(res.user);
      },
      register: async (name: string, email: string, password: string) => {
        const res = await registerUser(name, email, password);
        applyAuthResponse(res);
        const nextProfile = {
          name: name.trim(),
          email: email.trim(),
          password,
        };
        writeSessionProfile(nextProfile);
        setSessionProfile(nextProfile);
        setUser(res.user);
      },
      changePassword: async (currentPassword: string, newPassword: string) => {
        await changePassword(currentPassword, newPassword);
        setSessionProfile((prev) => {
          if (!prev) return prev;
          const nextProfile = { ...prev, password: newPassword };
          writeSessionProfile(nextProfile);
          return nextProfile;
        });
      },
      updateUserName: async (name: string) => {
        const res = await updateProfileName(name.trim());
        writeAuthUser(res.user);
        setUser(res.user);
        setSessionProfile((prev) => {
          if (!prev) return prev;
          const nextProfile = { ...prev, name: res.user.name };
          writeSessionProfile(nextProfile);
          return nextProfile;
        });
      },
      updateSessionProfile: (nextProfile: SessionProfile) => {
        writeSessionProfile(nextProfile);
        setSessionProfile(nextProfile);
      },
      logout: async () => {
        try {
          await logoutUser();
        } finally {
          clearAuthState();
          setUser(null);
          setSessionProfile(null);
        }
      },
    }),
    [isHydrating, sessionProfile, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
