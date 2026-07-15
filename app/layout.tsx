import type { Metadata } from "next";
import "@fontsource/amiri/400.css";
import "@fontsource/amiri/700.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "مِرْقَاةُ الْبَيَانِ — Fuṣḥā Tutor",
  description: "A learner-led literary Arabic speaking coach.",
  applicationName: "Mirqat al-Bayan",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
