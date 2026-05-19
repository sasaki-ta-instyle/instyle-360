import Link from "next/link";

export default function Page() {
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
      <div className="card" style={{ maxWidth: 520, width: "100%" }}>
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          INSTYLE GROUP / 360 review
        </p>
        <h1 className="t-h1" style={{ marginBottom: 16 }}>
          instyle 360
        </h1>
        <p className="t-body" style={{ marginBottom: 24, color: "var(--color-text-muted)" }}>
          グループ内向け 360 度評価システム。Phase 0 — 土台のみ稼働中。
        </p>
        <Link href="/sign-in" className="btn btn-primary">
          ログイン
        </Link>
      </div>
    </main>
  );
}
