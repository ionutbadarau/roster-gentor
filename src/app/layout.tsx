import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { TempoInit } from "@/components/tempo-init";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/lib/i18n";
import { ConsentProvider } from "@/lib/consent";
import { CookieBanner } from "@/components/consent/cookie-banner";
import { AnalyticsGate } from "@/components/consent/analytics-gate";
import QueryProvider from "@/components/query-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://plangarzi.ro"),
  title: {
    default: "Planificare Gărzi — Software Automat pentru Programul Lunar | PlanGarzi",
    template: "%s | PlanGarzi",
  },
  description:
    "Planificare gărzi automată pentru orice echipă cu program de tură — spitale, pompieri, paramedici, asistenți medicali, securitate, dispecerat. Generează programul lunar de gărzi în câteva secunde — distribuție echitabilă, conform legii, export PDF și Excel. Probă gratuită 90 de zile.",
  keywords: [
    "planificare garzi",
    "planificare gărzi",
    "planificare garzi excel",
    "planificare garzi spital",
    "software planificare garzi",
    "program garzi spital",
    "planificare ture",
    "program garzi medici",
    "program ture spital",
    "generator ture medicale",
    "planificare medici",
    "program garzi automat",
  ],
  applicationName: "PlanGarzi",
  alternates: {
    canonical: "/",
    languages: { "ro-RO": "/", "x-default": "/" },
  },
  openGraph: {
    type: "website",
    locale: "ro_RO",
    url: "https://plangarzi.ro",
    siteName: "PlanGarzi",
    title: "Planificare Gărzi — Software Automat pentru Programul Lunar | PlanGarzi",
    description:
      "Planificare gărzi automată pentru orice echipă cu program de tură — spitale, pompieri, paramedici, securitate, dispecerat. Generează programul lunar de gărzi în câteva secunde — echitabil, conform legii, export PDF și Excel.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Planificare Gărzi — Software Automat | PlanGarzi",
    description:
      "Software de planificare gărzi automat pentru orice echipă cu program de tură. Distribuție echitabilă, conform legii, export PDF și Excel în câteva secunde.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro" suppressHydrationWarning>

      <body className={inter.className}>
        {process.env.NODE_ENV !== "production" && (
          <div className="sticky top-0 z-[9999] w-full bg-yellow-400 text-black text-center text-xs font-semibold py-1 border-b border-yellow-600">
            DEV ENVIRONMENT
          </div>
        )}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <I18nProvider>
              <ConsentProvider>
                {children}
                <CookieBanner />
                <AnalyticsGate />
              </ConsentProvider>
            </I18nProvider>
          </QueryProvider>
        </ThemeProvider>
        {/* <TempoInit /> */}
      </body>
    </html>
  );
}
