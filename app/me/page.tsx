import Link from "next/link";
import { getCurrentUser } from "@/lib/test-mode";
import { db } from "@/db/client";
import { raters, subjects, projects } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const me = await getCurrentUser();
  if (!me) {
    return <EmptyState />;
  }

  // 自分が評価者として依頼されているもの
  const myAssignments = await db
    .select({
      raterId: raters.id,
      raterStatus: raters.status,
      raterToken: raters.token,
      relation: raters.relation,
      subjectUserId: subjects.userId,
      projectId: projects.id,
      projectName: projects.name,
      projectStatus: projects.status,
      projectClosesAt: projects.closesAt,
    })
    .from(raters)
    .innerJoin(subjects, eq(raters.subjectId, subjects.id))
    .innerJoin(projects, eq(subjects.projectId, projects.id))
    .where(eq(raters.userId, me.id))
    .orderBy(desc(projects.createdAt));

  // 自分が被評価者であるプロジェクト
  const aboutMe = await db
    .select({
      subjectId: subjects.id,
      projectId: projects.id,
      projectName: projects.name,
      projectStatus: projects.status,
    })
    .from(subjects)
    .innerJoin(projects, eq(subjects.projectId, projects.id))
    .where(eq(subjects.userId, me.id))
    .orderBy(desc(projects.createdAt));

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
          <h1 className="t-h1">
            {me.displayName ?? me.email}
            <span
              className="t-small"
              style={{
                marginLeft: 12,
                color: "var(--color-text-muted)",
                fontWeight: 400,
              }}
            >
              さんのマイページ
            </span>
          </h1>
          {me.isAdmin ? (
            <Link href="/admin/projects" className="btn btn-primary">
              管理者画面へ
            </Link>
          ) : null}
        </div>
      </header>

      {/* 依頼された評価 */}
      <section style={{ marginBottom: 32 }}>
        <h2 className="t-h3" style={{ marginBottom: 12 }}>
          依頼されている評価
        </h2>
        {myAssignments.length === 0 ? (
          <div className="card">
            <p className="t-body" style={{ color: "var(--color-text-muted)" }}>
              現在、依頼されている評価はありません。
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {myAssignments.map((a) => (
              <div key={a.raterId} className="card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <p
                      className="eyebrow"
                      style={{ marginBottom: 6, color: "var(--color-text-muted)" }}
                    >
                      {a.projectName}
                    </p>
                    <p className="t-body" style={{ marginBottom: 4 }}>
                      関係: {relationLabel(a.relation)} ・ 状態:{" "}
                      <StatusBadge status={a.raterStatus} />
                    </p>
                  </div>
                  <Link
                    href={`/answer/${a.raterToken}`}
                    className="btn btn-primary"
                  >
                    {a.raterStatus === "submitted" ? "回答を見直す" : "回答する"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 自分が被評価者であるプロジェクト */}
      {aboutMe.length > 0 ? (
        <section style={{ marginBottom: 32 }}>
          <h2 className="t-h3" style={{ marginBottom: 12 }}>
            自分が評価を受けているプロジェクト
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {aboutMe.map((s) => (
              <div key={s.subjectId} className="card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <p className="eyebrow" style={{ marginBottom: 6 }}>
                      {s.projectName}
                    </p>
                    <p
                      className="t-small"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      ステータス: {projectStatusLabel(s.projectStatus)}
                    </p>
                  </div>
                  <Link href={`/results/${s.subjectId}`} className="btn btn-secondary">
                    {s.projectStatus === "closed" ? "結果を見る" : "進捗を見る"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <footer style={{ marginTop: 48 }}>
        <p
          className="t-caption"
          style={{ color: "var(--color-text-light)", textAlign: "center" }}
        >
          Phase 1 — テスト表示。フッターの「切替」で他のユーザーになって見え方を試せます。
        </p>
      </footer>
    </main>
  );
}

function EmptyState() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div className="card" style={{ maxWidth: 460 }}>
        <p className="t-body">ユーザーが見つかりませんでした。</p>
        <p className="t-small" style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
          DB スキーマが当たっていないか、seed が走っていない可能性があります。
        </p>
      </div>
    </main>
  );
}

function relationLabel(r: string): string {
  switch (r) {
    case "self":
      return "自己評価";
    case "boss":
      return "上司から";
    case "peer":
      return "同僚から";
    case "subordinate":
      return "部下から";
    default:
      return r;
  }
}

function projectStatusLabel(s: string): string {
  switch (s) {
    case "draft":
      return "下書き";
    case "open":
      return "回答受付中";
    case "closed":
      return "締切済み";
    case "archived":
      return "アーカイブ";
    default:
      return s;
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    invited: { label: "未着手", color: "var(--color-text-muted)" },
    in_progress: { label: "回答中", color: "var(--color-warning)" },
    submitted: { label: "提出済み", color: "var(--color-success)" },
  };
  const v = map[status] ?? { label: status, color: "var(--color-text-muted)" };
  return <span style={{ color: v.color, fontWeight: 600 }}>{v.label}</span>;
}
