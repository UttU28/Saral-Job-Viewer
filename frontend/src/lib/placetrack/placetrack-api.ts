const API_BASE = "https://placetrack.tcbot.ai";

export class PlaceTrackApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PlaceTrackApiError";
    this.status = status;
  }
}

export function isPlaceTrackAuthError(error: unknown): boolean {
  return error instanceof PlaceTrackApiError && (error.status === 401 || error.status === 403);
}

export type PlaceTrackLoginResponse = {
  access_token?: string;
  token?: string;
  token_type?: string;
};

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (typeof body?.message === "string") return body.message;
    return JSON.stringify(body);
  } catch {
    return response.statusText || "Request failed";
  }
}

export async function loginPlaceTrack(username: string, password: string): Promise<string> {
  const body = new URLSearchParams({
    username: username.trim(),
    password,
  });

  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new PlaceTrackApiError(await parseErrorMessage(response), response.status);
  }

  const data = (await response.json()) as PlaceTrackLoginResponse;
  const token = (data.access_token ?? data.token)?.trim();
  if (!token) {
    throw new PlaceTrackApiError("Login succeeded but no token was returned", response.status);
  }

  return token;
}

async function fetchAuthed(token: string, path: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new PlaceTrackApiError(await parseErrorMessage(response), response.status);
  }

  return response.json();
}

export async function fetchPipeline(token: string): Promise<unknown> {
  return fetchAuthed(token, "/api/admin/pipeline");
}

export async function fetchAdminUsers(token: string): Promise<unknown> {
  return fetchAuthed(token, "/api/admin/users");
}

export async function fetchPsUsers(token: string): Promise<unknown> {
  return fetchAuthed(token, "/api/pod/ps-users");
}

export async function fetchAdminAccounts(token: string): Promise<unknown> {
  return fetchAuthed(token, "/api/admin/accounts");
}

export async function fetchAdminVendors(token: string): Promise<unknown> {
  return fetchAuthed(token, "/api/admin/vendors");
}

export async function fetchPipelineContext(token: string): Promise<{
  pipeline: unknown;
  users: unknown;
  psUsers: unknown;
  accounts: unknown;
  vendors: unknown;
}> {
  const [pipeline, users, psUsers, accounts, vendors] = await Promise.all([
    fetchPipeline(token),
    fetchAdminUsers(token),
    fetchPsUsers(token),
    fetchAdminAccounts(token),
    fetchAdminVendors(token),
  ]);

  return { pipeline, users, psUsers, accounts, vendors };
}
