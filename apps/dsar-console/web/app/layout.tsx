import "@paved/ui/styles.css";
import type { ReactNode } from "react";
import { Providers } from "./providers.tsx";

export const metadata = {
  title: "Data subject requests",
  description: "Internal DSAR console built on the paved road.",
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
