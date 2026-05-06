const AUTH_TOKEN_KEY = "saralJobViewer.authToken";
const AUTH_USER_KEY = "saralJobViewer.authUser";
const SESSION_PROFILE_KEY = "saralJobViewer.sessionProfile";

export type AuthUser = {
  userId: string;
  name: string;
  email: string;
  isAdmin: boolean;
  profilePhotoUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionProfile = {
  name: string;
  email: string;
  password: string;
};

export function readAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function writeAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function readAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (!parsed.userId || !parsed.email) return null;
    return {
      userId: parsed.userId,
      name: parsed.name ?? "",
      email: parsed.email,
      isAdmin: Boolean(parsed.isAdmin),
      profilePhotoUrl: String(parsed.profilePhotoUrl ?? ""),
      createdAt: String(parsed.createdAt ?? ""),
      updatedAt: String(parsed.updatedAt ?? ""),
    };
  } catch {
    return null;
  }
}

export function writeAuthUser(user: AuthUser): void {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearAuthUser(): void {
  localStorage.removeItem(AUTH_USER_KEY);
}

export function clearAuthState(): void {
  clearAuthToken();
  clearAuthUser();
  localStorage.removeItem(SESSION_PROFILE_KEY);
}

export function readSessionProfile(): SessionProfile | null {
  const raw = localStorage.getItem(SESSION_PROFILE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionProfile>;
    return {
      name: String(parsed.name ?? ""),
      email: String(parsed.email ?? ""),
      password: String(parsed.password ?? ""),
    };
  } catch {
    return null;
  }
}

export function writeSessionProfile(profile: SessionProfile): void {
  localStorage.setItem(
    SESSION_PROFILE_KEY,
    JSON.stringify({
      name: profile.name,
      email: profile.email,
      password: profile.password,
    }),
  );
}
