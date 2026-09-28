import "@paved/ui/styles.css";
import type { ReactNode } from "react";
import { Providers } from "./providers.tsx";

export const metadata = {
  title: "KYC review queue",
  description: "Internal KYC case review tool built on the paved road.",
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
