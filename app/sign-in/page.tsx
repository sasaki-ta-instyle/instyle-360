import Link from "next/link";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
      }}
    >
      <div className="card" style={{ maxWidth: 460, width: "100%" }}>
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          INSTYLE GROUP / 360 review
        </p>
        <h1 className="t-h2" style={{ marginBottom: 8 }}>
          ログイン
        </h1>
        <p
          className="t-small"
          style={{ color: "var(--color-text-muted)", marginBottom: 24 }}
        >
          テスト中。ボタンを押すとそのまま進みます（本番化時にメール認証に戻します）。
        </p>

        <Link href="/me" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
          ログイン
        </Link>
      </div>
    </main>
  );
}
