import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { ar } from "@/content/ar";
import "./globals.css";

export const metadata: Metadata = { title: ar.app.name, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
