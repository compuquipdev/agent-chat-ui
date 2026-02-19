"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { v4 as uuidv4 } from "uuid";
import {
  clearStoredTokens,
  getStoredSessionToken,
  getStoredUserToken,
  loginUser,
  registerUser,
  storeSessionToken,
  storeUserToken,
} from "@/lib/auth";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type StreamContextType = {
  messages: ChatMessage[];
  isLoading: boolean;
  error?: string;
  hasSession: boolean;
  hasUser: boolean;
  sessions: SessionItem[];
  sessionsLoading: boolean;
  currentSessionId: string | null;
  sendMessage: (text: string) => Promise<void>;
  stop: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSessions: () => Promise<void>;
  createSession: (name?: string, options?: { preserveMessages?: boolean }) => Promise<SessionItem | void>;
  selectSession: (session: SessionItem, options?: { preserveMessages?: boolean }) => void;
  deleteSession: (session: SessionItem) => Promise<void>;
};

const StreamContext = createContext<StreamContextType | undefined>(undefined);

const STREAM_PATH = "/api/v1/chatbot/chat/stream";
const SESSION_NAME_MAX_LENGTH = 40;

type SessionItem = {
  session_id: string;
  name: string;
  token: {
    access_token: string;
    token_type: "bearer";
    expires_at: string;
  };
};

const deriveSessionName = (text: string) => {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  if (trimmed.length <= SESSION_NAME_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, SESSION_NAME_MAX_LENGTH).trimEnd() + "…";
};

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const baseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    [],
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const historyLoadedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const stored = getStoredSessionToken();
    if (stored) setSessionToken(stored);
    const storedUser = getStoredUserToken();
    if (storedUser) setUserToken(storedUser);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const hasSession = !!sessionToken;
  const hasUser = !!userToken;

  const stop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsLoading(false);
  };

  const logout = () => {
    stop();
    clearStoredTokens();
    setSessionToken(null);
    setUserToken(null);
    setSessions([]);
    setCurrentSessionId(null);
    setMessages([]);
    setError(undefined);
    historyLoadedRef.current = false;
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(undefined);
    try {
      setMessages([]);
      historyLoadedRef.current = false;
      const loginResponse = await loginUser(baseUrl, email, password);
      storeUserToken(loginResponse.access_token);
      setUserToken(loginResponse.access_token);
      setSessionToken(null);
      setCurrentSessionId(null);
      setSessions([]);
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    setIsLoading(true);
    setError(undefined);
    try {
      setMessages([]);
      historyLoadedRef.current = false;
      const registration = await registerUser(baseUrl, email, password);
      storeUserToken(registration.token.access_token);
      setUserToken(registration.token.access_token);
      setSessionToken(null);
      setCurrentSessionId(null);
      setSessions([]);
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadHistory = async () => {
      if (!sessionToken || historyLoadedRef.current) return;
      historyLoadedRef.current = true;
      try {
        const res = await fetch(`${baseUrl}/api/v1/chatbot/messages`, {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        });
        if (res.status === 401 || res.status === 403) {
          logout();
          setError("Session expired. Please log in again.");
          return;
        }
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail?.detail || "Failed to load chat history.");
        }
        const data = (await res.json()) as {
          messages?: { role: ChatMessage["role"]; content: string }[];
        };
        if (data?.messages?.length) {
          setMessages(
            data.messages.map((msg) => ({
              id: uuidv4(),
              role: msg.role,
              content: msg.content,
            })),
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history.");
      }
    };

    loadHistory();
  }, [baseUrl, sessionToken]);

  const refreshSessions = async () => {
    if (!userToken) return;
    setSessionsLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/v1/auth/sessions`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });
      if (res.status === 401 || res.status === 403) {
        logout();
        setError("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || "Failed to load sessions.");
      }
      const data = (await res.json()) as SessionItem[];
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions.");
    } finally {
      setSessionsLoading(false);
    }
  };

  const renameSession = async (
    session: SessionItem,
    name: string,
    options?: { updateList?: boolean },
  ): Promise<SessionItem | null> => {
    const trimmed = name.trim();
    if (!trimmed) return session;
    const body = new URLSearchParams();
    body.set("name", trimmed);
    try {
      const res = await fetch(
        `${baseUrl}/api/v1/auth/session/${session.session_id}/name`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.token.access_token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        },
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || "Failed to rename session.");
      }
      const updated = (await res.json()) as SessionItem;
      if (options?.updateList !== false) {
        setSessions((prev) =>
          prev.map((item) =>
            item.session_id === updated.session_id ? updated : item,
          ),
        );
      }
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename session.");
      return null;
    }
  };

  const createSession = async (
    name?: string,
    options?: { preserveMessages?: boolean },
  ) => {
    if (!userToken) {
      setError("Please log in to create a session.");
      return;
    }
    setIsLoading(true);
    setError(undefined);
    try {
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
      const session = (await res.json()) as SessionItem;
      const renamed =
        name ? await renameSession(session, name, { updateList: false }) : null;
      const finalSession = renamed ?? session;
      setSessions((prev) => [finalSession, ...prev]);
      selectSession(finalSession, { preserveMessages: options?.preserveMessages });
      return finalSession;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectSession = (
    session: SessionItem,
    options?: { preserveMessages?: boolean },
  ) => {
    stop();
    setCurrentSessionId(session.session_id);
    setSessionToken(session.token.access_token);
    storeSessionToken(session.token.access_token, session.session_id);
    if (!options?.preserveMessages) {
      setMessages([]);
    }
    historyLoadedRef.current = false;
  };

  const deleteSession = async (session: SessionItem) => {
    setIsLoading(true);
    setError(undefined);
    try {
      const res = await fetch(
        `${baseUrl}/api/v1/auth/session/${session.session_id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.token.access_token}`,
          },
        },
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || "Failed to delete session.");
      }
      setSessions((prev) =>
        prev.filter((item) => item.session_id !== session.session_id),
      );
      if (currentSessionId === session.session_id) {
        stop();
        setCurrentSessionId(null);
        setSessionToken(null);
        setMessages([]);
        historyLoadedRef.current = false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (userToken) {
      refreshSessions().catch(() => undefined);
    }
  }, [userToken]);

  const sendMessage = async (text: string) => {
    if (!userToken) {
      setError("Please log in to start chatting.");
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > 3000) {
      setError("Message too long (max 3000 characters).");
      return;
    }

    setError(undefined);
    setIsLoading(true);

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: trimmed,
    };
    const assistantId = uuidv4();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    let activeSessionToken = sessionToken;
    if (!activeSessionToken) {
      const sessionName = deriveSessionName(trimmed);
      const session = await createSession(sessionName, {
        preserveMessages: true,
      });
      activeSessionToken = session?.token.access_token ?? null;
      if (!activeSessionToken) {
        setIsLoading(false);
        setError("Unable to create a session.");
        return;
      }
    } else if (currentSessionId) {
      const currentSession = sessions.find(
        (session) => session.session_id === currentSessionId,
      );
      if (currentSession && !currentSession.name?.trim()) {
        const sessionName = deriveSessionName(trimmed);
        await renameSession(currentSession, sessionName);
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${baseUrl}${STREAM_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeSessionToken}`,
        },
        body: JSON.stringify({
          messages: [...messagesRef.current, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {
        logout();
        setError("Session expired. Please log in again.");
        return;
      }

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || "Failed to start stream.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;

            let data: { content?: string; done?: boolean } | null = null;
            try {
              data = JSON.parse(payload);
            } catch {
              data = null;
            }

            if (!data) continue;
            if (data.done) {
              setIsLoading(false);
              continue;
            }

            if (data.content) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: msg.content + data.content }
                    : msg,
                ),
              );
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Streaming failed.");
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <StreamContext.Provider
      value={{
        messages,
        isLoading,
        error,
        hasSession,
        hasUser,
        sessions,
        sessionsLoading,
        currentSessionId,
        sendMessage,
        stop,
        login,
        register,
        logout,
        refreshSessions,
        createSession,
        selectSession,
        deleteSession,
      }}
    >
      {children}
    </StreamContext.Provider>
  );
};

export const useStreamContext = (): StreamContextType => {
  const context = useContext(StreamContext);
  if (!context) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};

export default StreamContext;
