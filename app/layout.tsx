import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar, BackButton } from "@/components";
import { Footer } from "@/containers";
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://kf8fvd.com'),
  title: "KF8FVD Info Page",
  description: "KF8FVD Zach Amateur Radio Operator Page",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" as="image" href="/grand_rapids.jpg" />
        <meta property="og:site_name" content="KF8FVD" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Person",
              "@id": "https://kf8fvd.com/#person",
              "name": "Zachary (KF8FVD)",
              "alternateName": "KF8FVD",
              "url": "https://kf8fvd.com/",
              "jobTitle": "CNC & EDM Specialist",
              "description": "Amateur radio operator and maker based in Kentwood, MI."
            },
            {
              "@type": "WebSite",
              "@id": "https://kf8fvd.com/#website",
              "url": "https://kf8fvd.com/",
              "name": "KF8FVD",
              "publisher": { "@id": "https://kf8fvd.com/#person" }
            }
          ]
        }) }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <a href="#main" className="skip">Skip to content</a>
        <Navbar />
        <BackButton />
        <SessionProviderClient>
          {children}
        </SessionProviderClient>
        <Footer />
      </body>
    </html>
  );
}
