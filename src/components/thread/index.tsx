"use client";

import { useEffect, useRef, useState } from "react";
import { useStreamContext } from "@/providers/Stream";
import { AssistantMessage, AssistantMessageLoading } from "./messages/ai";
import { HumanMessage } from "./messages/human";
import { SystemMessage } from "./messages/system";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { PasswordInput } from "../ui/password-input";
import { Textarea } from "../ui/textarea";
import { LangGraphLogoSVG } from "../icons/langgraph";
import { Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

export function Thread() {
  const stream = useStreamContext();
  const {
    messages,
    isLoading,
    error,
    hasSession,
    hasUser,
    sessions,
    sessionsLoading,
    currentSessionId,
  } = stream;
  const [input, setInput] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [inputError, setInputError] = useState<string | null>(null);
  const lastMessage = messages[messages.length - 1];
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastSessionParamRef = useRef<string | null>(null);
  const sessionParam = searchParams.get("sessionId");
  const formatSessionLabel = (sessionId: string, name: string) =>
    name?.trim() || `Session ${sessionId.slice(0, 8)}`;

  useEffect(() => {
    if (!hasUser || sessionsLoading) return;
    if (!sessionParam) return;
    if (sessionParam === currentSessionId) return;
    const matching = sessions.find((s) => s.session_id === sessionParam);
    if (matching) {
      stream.selectSession(matching);
    }
  }, [hasUser, sessionsLoading, sessionParam, currentSessionId, sessions, stream]);

  useEffect(() => {
    if (!currentSessionId) return;
    if (lastSessionParamRef.current === currentSessionId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("sessionId", currentSessionId);
    lastSessionParamRef.current = currentSessionId;
    router.replace(`?${params.toString()}`);
  }, [currentSessionId, router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (!input.trim()) {
      setInputError("Please enter a message.");
      return;
    }
    if (input.trim().length > 3000) {
      setInputError("Message too long (max 3000 characters).");
      return;
    }
    setInputError(null);
    await stream.sendMessage(input);
    setInput("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    await stream.login(email, password);
    setPassword("");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    await stream.register(email, password);
    setPassword("");
  };

  if (!hasUser) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <div className="animate-in fade-in-0 zoom-in-95 bg-background flex w-full max-w-md flex-col rounded-lg border shadow-lg">
          <div className="mt-10 flex flex-col gap-2 border-b p-6">
            <div className="flex flex-col items-start gap-2">
              <LangGraphLogoSVG className="h-7" />
              <h1 className="text-xl font-semibold tracking-tight">
                Agent Chat
              </h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Log in to start chatting.
            </p>
          </div>
          <form
            onSubmit={authMode === "login" ? handleLogin : handleRegister}
            className="bg-muted/50 flex flex-col gap-4 p-6"
          >
            <div className="flex flex-col gap-2">
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <PasswordInput
                id="password"
                name="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {authMode === "register" && (
                <p className="text-xs text-muted-foreground">
                  Password must include uppercase, lowercase, number, and a
                  special character.
                </p>
              )}
            </div>
            {error && <div className="text-sm text-rose-600">{error}</div>}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setAuthMode((prev) =>
                    prev === "login" ? "register" : "login",
                  )
                }
              >
                {authMode === "login"
                  ? "Create account"
                  : "Use existing account"}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? authMode === "login"
                    ? "Signing in..."
                    : "Creating..."
                  : authMode === "login"
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="w-64 border-r bg-muted/30">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Sessions</p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => stream.refreshSessions()}
              disabled={sessionsLoading}
            >
              Refresh
            </Button>
            <Button size="sm" onClick={() => stream.createSession()}>
              New
            </Button>
          </div>
        </div>
        <div className="h-full overflow-auto px-2 py-3">
          {sessionsLoading && (
            <div className="px-2 text-xs text-muted-foreground">
              Loading sessions...
            </div>
          )}
          {!sessionsLoading && sessions.length === 0 && (
            <div className="px-2 text-xs text-muted-foreground">
              No sessions yet.
            </div>
          )}
          <div className="flex flex-col gap-1">
            {sessions.map((session) => {
              const isActive = session.session_id === currentSessionId;
              return (
                <div
                  key={session.session_id}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? "bg-white text-foreground shadow"
                      : "text-muted-foreground hover:bg-white/60 hover:text-foreground"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => stream.selectSession(session)}
                    className="flex-1 text-left"
                  >
                    {formatSessionLabel(session.session_id, session.name)}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => stream.deleteSession(session)}
                    title="Delete session"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="flex h-full w-full flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <LangGraphLogoSVG className="h-6 w-6" />
            <div>
              <p className="text-sm font-semibold leading-none">Agent Chat</p>
              <p className="text-xs text-muted-foreground">
              Connected to FastAPI backend
            </p>
          </div>
        </div>
        <Button variant="ghost" onClick={stream.logout}>
          Log out
        </Button>
      </header>

      <main className="flex-1 overflow-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {messages.length === 0 && (
            <div className="text-muted-foreground text-sm">
              {hasSession
                ? "Send a message to start the conversation."
                : "Send your first message to create a new session."}
            </div>
          )}
          {messages.map((message) => {
            if (message.role === "system") {
              return <SystemMessage key={message.id} message={message} />;
            }
            if (message.role === "user") {
              return <HumanMessage key={message.id} message={message} />;
            }
            return <AssistantMessage key={message.id} message={message} />;
          })}
          {isLoading &&
            (!lastMessage ||
              lastMessage.role !== "assistant" ||
              lastMessage.content.length === 0) && <AssistantMessageLoading />}
        </div>
      </main>

      <footer className="border-t px-4 py-4">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-3xl flex-col gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            rows={3}
          />
          {inputError && (
            <div className="text-sm text-rose-600">{inputError}</div>
          )}
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Max 3000 characters.
            </div>
            {isLoading ? (
              <Button type="button" variant="secondary" onClick={stream.stop}>
                Stop
              </Button>
            ) : (
              <Button type="submit">Send</Button>
            )}
          </div>
        </form>
      </footer>
      </div>
    </div>
  );
}
