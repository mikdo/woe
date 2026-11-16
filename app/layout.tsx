import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";
import { PlayerProvider } from "@/components/PlayerProvider";

export const metadata: Metadata = {
  title: "WOE! What On Earth?",
  description: "Ask Otto and Cheko anything. A curious kids' science show made from your questions.",
  appleWebApp: { capable: true, title: "WOE!", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#fff8ec",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="min-h-dvh antialiased">
        <PlayerProvider>{children}</PlayerProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
