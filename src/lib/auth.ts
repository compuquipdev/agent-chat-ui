export type LoginResponse = {
  access_token: string;
  token_type: "bearer";
  expires_at: string;
};

export type UserResponse = {
  id: number;
  email: string;
  token: {
    access_token: string;
    token_type: "bearer";
    expires_at: string;
  };
};

export type SessionResponse = {
  session_id: string;
  name: string;
  token: {
    access_token: string;
    token_type: "bearer";
    expires_at: string;
  };
};

const USER_TOKEN_KEY = "chat:userToken";
const SESSION_TOKEN_KEY = "chat:sessionToken";
const SESSION_ID_KEY = "chat:sessionId";

export function getStoredSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_TOKEN_KEY);
}

export function getStoredUserToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(USER_TOKEN_KEY);
}

export function storeSessionToken(token: string, sessionId?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  if (sessionId) {
    window.localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
}

export function storeUserToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_TOKEN_KEY, token);
}

export function clearStoredTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_TOKEN_KEY);
  window.localStorage.removeItem(SESSION_TOKEN_KEY);
  window.localStorage.removeItem(SESSION_ID_KEY);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export async function loginUser(
  baseUrl: string,
  email: string,
  password: string,
): Promise<LoginResponse> {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);
  body.set("grant_type", "password");

  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail || "Login failed.");
  }

  return (await res.json()) as LoginResponse;
}

export async function registerUser(
  baseUrl: string,
  email: string,
  password: string,
): Promise<UserResponse> {
  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail || "Registration failed.");
  }

  return (await res.json()) as UserResponse;
}

export async function createSession(
  baseUrl: string,
  userToken: string,
): Promise<SessionResponse> {
  const res = await fetch(`${baseUrl}/api/v1/auth/session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
    },
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail || "Failed to create session.");
  }

  return (await res.json()) as SessionResponse;
}

export async function loginAndCreateSession(
  baseUrl: string,
  email: string,
  password: string,
) {
  try {
    const login = await loginUser(baseUrl, email, password);
    storeUserToken(login.access_token);
    const session = await createSession(baseUrl, login.access_token);
    storeSessionToken(session.token.access_token, session.session_id);
    return session;
  } catch (error) {
    clearStoredTokens();
    throw new Error(getErrorMessage(error, "Authentication failed."));
  }
}

export async function registerAndCreateSession(
  baseUrl: string,
  email: string,
  password: string,
) {
  try {
    const registration = await registerUser(baseUrl, email, password);
    storeUserToken(registration.token.access_token);
    const session = await createSession(baseUrl, registration.token.access_token);
    storeSessionToken(session.token.access_token, session.session_id);
    return session;
  } catch (error) {
    clearStoredTokens();
    throw new Error(getErrorMessage(error, "Registration failed."));
  }
}
