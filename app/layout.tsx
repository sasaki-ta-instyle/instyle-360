import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser, listUsers } from "@/lib/test-mode";
import { TestModeFooter } from "@/components/TestModeFooter";

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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // テストモード中だけ、フッターのロール切替に必要な情報を取得する
  // DB 未接続のときは静かに空にする
  let footerUsers: { id: string; displayName: string; isAdmin: boolean }[] = [];
  let currentUserId: string | null = null;
  try {
    const [me, all] = await Promise.all([getCurrentUser(), listUsers()]);
    currentUserId = me?.id ?? null;
    footerUsers = all
      .map((u) => ({
        id: u.id,
        displayName: u.displayName ?? u.name ?? u.email,
        isAdmin: u.isAdmin,
      }))
      .sort((a, b) => (a.isAdmin === b.isAdmin ? 0 : a.isAdmin ? -1 : 1));
  } catch {
    // schema 未適用などで失敗してもページ自体は描画する
  }

  return (
    <html lang="ja">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/gen-interface-jp@0.1.2/all.css"
        />
      </head>
      <body style={{ paddingBottom: 80 }}>
        {children}
        {footerUsers.length > 0 ? (
          <TestModeFooter users={footerUsers} currentUserId={currentUserId} />
        ) : null}
      </body>
    </html>
  );
}
