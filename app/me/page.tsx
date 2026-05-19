import Link from "next/link";

export const dynamic = "force-dynamic";

export default function MyPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 24px",
        maxWidth: 920,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          INSTYLE GROUP / 360 review
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <h1 className="t-h1">マイページ</h1>
          <Link
            href="/"
            className="t-small"
            style={{ color: "var(--color-text-muted)", textDecoration: "none" }}
          >
            ← トップへ
          </Link>
        </div>
      </header>

      <section style={{ marginBottom: 24 }}>
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            進行中の評価
          </p>
          <h2 className="t-h3" style={{ marginBottom: 16 }}>
            まだ評価依頼は届いていません
          </h2>
          <p className="t-body" style={{ color: "var(--color-text-muted)" }}>
            管理者がプロジェクトを作成して評価者として割り当てると、ここに表示されます。
          </p>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <div className="card-nested">
          <p className="eyebrow" style={{ marginBottom: 8 }}>過去の結果</p>
          <p className="t-small" style={{ color: "var(--color-text-muted)" }}>
            公開期間中の自分の 360 レポートをここから開けます（Phase 1 で実装予定）。
          </p>
        </div>
        <div className="card-nested">
          <p className="eyebrow" style={{ marginBottom: 8 }}>振り返りメモ</p>
          <p className="t-small" style={{ color: "var(--color-text-muted)" }}>
            自分だけが読めるメモ。フィードバックを受けた後の気づきを書き留めます（Phase 2）。
          </p>
        </div>
        <div className="card-nested">
          <p className="eyebrow" style={{ marginBottom: 8 }}>AI 気づきサポート</p>
          <p className="t-small" style={{ color: "var(--color-text-muted)" }}>
            コメントから強み・弱み・テーマを抽出（Phase 3）。
          </p>
        </div>
      </section>

      <footer style={{ marginTop: 48 }}>
        <p
          className="t-caption"
          style={{ color: "var(--color-text-light)", textAlign: "center" }}
        >
          Phase 0 — テスト表示。認証は本番化時に有効化します。
        </p>
      </footer>
    </main>
  );
}
