import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const font = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-sg" });

export const metadata: Metadata = {
  title: "Penapis Saham Bursa",
  description:
    "Saringan teknikal harian saham Bursa Malaysia: volum, momentum, RSI dan Bollinger breakout. Akses terhad kepada pengguna berdaftar.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Tetapkan tema dan bahasa sebelum paparan pertama, supaya tiada kelipan.
const INIT = `(function(){var t="light";try{t=localStorage.getItem("pb_theme")||"light";}catch(e){}document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");try{if(localStorage.getItem("pb_lang")==="en")document.documentElement.lang="en";}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ms" data-theme="light" className={font.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INIT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
