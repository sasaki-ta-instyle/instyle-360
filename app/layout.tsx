import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://app.instyle.group/instyle-360";
const ASSETS = "https://app.instyle.group/_shared/static";
const TITLE = "instyle 360 | INSTYLE GROUP";
const DESCRIPTION =
  "instyle group オリジナル 360 度評価システム。評価サイクルを設計し、配信し、結果をフィードバックする。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: {
    icon: `${ASSETS}/favicon.png`,
    apple: `${ASSETS}/favicon.png`,
  },
  openGraph: {
    type: "website",
    siteName: "INSTYLE GROUP",
    locale: "ja_JP",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${ASSETS}/ogp.jpg`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [`${ASSETS}/ogp.jpg`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/gen-interface-jp@0.1.2/all.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
