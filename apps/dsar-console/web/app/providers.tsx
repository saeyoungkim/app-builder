"use client";

import { SessionProvider, createApiClient } from "@paved/ui";
import type { ReactNode } from "react";

const api = createApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4003");

export function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider api={api}>{children}</SessionProvider>;
}
