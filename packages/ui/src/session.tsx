"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, type ApiClient } from "./api.ts";

export interface Principal {
  sub: string;
  email: string;
  name: string;
  groups: string[];
  roles: string[];
  permissions: string[];
  regions: string[];
}

interface SessionState {
  principal?: Principal;
  loading: boolean;
  error?: string;
  loginUrl?: string;
  api: ApiClient;
  can: (permission: string) => boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionState | undefined>(undefined);

export function SessionProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  const [principal, setPrincipal] = useState<Principal>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [loginUrl, setLoginUrl] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ principal: Principal }>("/api/me")
      .then((data) => {
        if (!cancelled) setPrincipal(data.principal);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setLoginUrl(err.loginUrl ?? api.loginUrl(window.location.href));
        } else {
          setError(err instanceof Error ? err.message : "unknown_error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const value: SessionState = {
    principal,
    loading,
    error,
    loginUrl,
    api,
    can: (permission) => principal?.permissions.includes(permission) ?? false,
    logout: async () => {
      await api.post("/auth/logout", {});
      window.location.reload();
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
