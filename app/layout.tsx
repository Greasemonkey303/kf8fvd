import type { Metadata } from "next";
import { Geist, Geist_Mono, Oswald } from "next/font/google";
import { cookies } from 'next/headers'
import { Navbar } from "@/components";
import { Footer } from "@/containers";
import UmamiAnalytics from '@/components/analytics/UmamiAnalytics'
import UmamiPageTracker from '@/components/analytics/UmamiPageTracker'
import '../styles/app.css'
import '../styles/global.css'
import SessionProviderClient from './providers/SessionProviderClient'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.kf8fvd.com'),
  title: {
    default: 'KF8FVD Amateur Radio',
    template: '%s | KF8FVD',
  },
  description: 'KF8FVD amateur radio station dashboard, projects, credentials, and operating activity.',
  alternates: { canonical: '/' },
  icons: { icon: '/logo/mini-logo.svg' },
  manifest: '/manifest.webmanifest',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const _cookies = await cookies();
  const nonce = _cookies.get('csp-nonce')?.value || undefined;

  return (
    <html lang="en">
      <head>
        {/* preloading large hero image removed to avoid duplicate/unused preload warnings */}
        <meta property="og:site_name" content="KF8FVD" />
        <meta name="twitter:card" content="summary_large_image" />
        {/* Early theme initializer (external to avoid CSP inline blocks) */}
        <script src="/theme-init.js" defer />
        <script suppressHydrationWarning type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Person",
              "@id": "https://www.kf8fvd.com/#person",
              "name": "Zachary (KF8FVD)",
              "alternateName": "KF8FVD",
              "url": "https://www.kf8fvd.com/",
              "jobTitle": "CNC & EDM Specialist",
              "description": "Amateur radio operator and maker based in Kentwood, MI."
            },
            {
              "@type": "WebSite",
              "@id": "https://www.kf8fvd.com/#website",
              "url": "https://www.kf8fvd.com/",
              "name": "KF8FVD",
              "publisher": { "@id": "https://www.kf8fvd.com/#person" }
            }
          ]
        }) }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${oswald.variable}`}>
        <a href="#main" className="skip">Skip to content</a>
        <UmamiAnalytics />
        <UmamiPageTracker />
        <SessionProviderClient>
          <Navbar />
          {children}
        </SessionProviderClient>
        <Footer />
      </body>
    </html>
  );
}
