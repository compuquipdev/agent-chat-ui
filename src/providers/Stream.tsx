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
  loginAndCreateSession,
  registerAndCreateSession,
  storeSessionToken,
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
  sessions: SessionItem[];
  sessionsLoading: boolean;
  currentSessionId: string | null;
  sendMessage: (text: string) => Promise<void>;
  stop: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSessions: () => Promise<void>;
  createSession: () => Promise<void>;
  selectSession: (session: SessionItem) => void;
};

const StreamContext = createContext<StreamContextType | undefined>(undefined);

const STREAM_PATH = "/api/v1/chatbot/chat/stream";

type SessionItem = {
  session_id: string;
  name: string;
  token: {
    access_token: string;
    token_type: "bearer";
    expires_at: string;
  };
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
      const session = await loginAndCreateSession(baseUrl, email, password);
      const storedUser = getStoredUserToken();
      if (storedUser) setUserToken(storedUser);
      setCurrentSessionId(session.session_id);
      setSessionToken(session.token.access_token);
      storeSessionToken(session.token.access_token, session.session_id);
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
      const session = await registerAndCreateSession(baseUrl, email, password);
      const storedUser = getStoredUserToken();
      if (storedUser) setUserToken(storedUser);
      setCurrentSessionId(session.session_id);
      setSessionToken(session.token.access_token);
      storeSessionToken(session.token.access_token, session.session_id);
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
      if (!currentSessionId && data.length > 0) {
        const first = data[0];
        setCurrentSessionId(first.session_id);
        setSessionToken(first.token.access_token);
        storeSessionToken(first.token.access_token, first.session_id);
        historyLoadedRef.current = false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions.");
    } finally {
      setSessionsLoading(false);
    }
  };

  const createSession = async () => {
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
      setSessions((prev) => [session, ...prev]);
      selectSession(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectSession = (session: SessionItem) => {
    stop();
    setCurrentSessionId(session.session_id);
    setSessionToken(session.token.access_token);
    storeSessionToken(session.token.access_token, session.session_id);
    setMessages([]);
    historyLoadedRef.current = false;
  };

  useEffect(() => {
    if (userToken) {
      refreshSessions().catch(() => undefined);
    }
  }, [userToken]);

  const sendMessage = async (text: string) => {
    if (!sessionToken) {
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

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${baseUrl}${STREAM_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
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
