import "@paved/ui/styles.css";
import type { ReactNode } from "react";
import { Providers } from "./providers.tsx";

export const metadata = {
  title: "Customer data console",
  description: "Internal customer data management tool built on the paved road.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
