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
    default: "PlanGarzi — Planificare Gărzi și Ture pentru Medici",
    template: "%s | PlanGarzi",
  },
  description:
    "Planificare gărzi și ture medicale automat. Generează programul lunar al spitalului în câteva secunde — distribuție echitabilă, conform legii, export PDF și Excel.",
  keywords: [
    "planificare garzi",
    "planificare gărzi",
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
    title: "PlanGarzi — Planificare Gărzi și Ture pentru Medici",
    description:
      "Aplicație web pentru planificarea gărzilor și turelor medicale. Generează programul lunar automat — echitabil, conform legii, export PDF și Excel.",
  },
  twitter: {
    card: "summary_large_image",
    title: "PlanGarzi — Planificare Gărzi și Ture",
    description:
      "Planifică gărzile și turele medicale automat. Distribuție echitabilă, conform legii, export PDF și Excel în câteva secunde.",
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
