import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/test-mode";
import { db } from "@/db/client";
import { projects, subjects, raters } from "@/db/schema";
import { desc, eq, count, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const me = await getCurrentUser();
  if (!me?.isAdmin) {
    redirect("/me");
  }

  // プロジェクト一覧 + 進捗集計
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      opensAt: projects.opensAt,
      closesAt: projects.closesAt,
      subjectsCount: sql<number>`COUNT(DISTINCT ${subjects.id})`.as("subjects_count"),
      ratersCount: sql<number>`COUNT(DISTINCT ${raters.id})`.as("raters_count"),
      submittedCount: sql<number>`COUNT(DISTINCT CASE WHEN ${raters.status} = 'submitted' THEN ${raters.id} END)`.as("submitted_count"),
    })
    .from(projects)
    .leftJoin(subjects, eq(subjects.projectId, projects.id))
    .leftJoin(raters, eq(raters.subjectId, subjects.id))
    .groupBy(projects.id)
    .orderBy(desc(projects.createdAt));

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 24px",
        maxWidth: 1080,
        margin: "0 auto",
      }}
    >
      <BreadCrumb />

      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <h1 className="t-h1">プロジェクト</h1>
        <Link href="/admin/projects/new" className="btn btn-primary">
          ＋ 新規プロジェクト
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="card">
          <p className="t-body">まだプロジェクトがありません。</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((p) => {
            const total = Number(p.ratersCount ?? 0);
            const submitted = Number(p.submittedCount ?? 0);
            const pct = total === 0 ? 0 : Math.round((submitted / total) * 100);
            return (
              <Link
                key={p.id}
                href={`/admin/projects/${p.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="card" style={{ transition: "background 200ms" }}>
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
                      <p className="eyebrow" style={{ marginBottom: 8 }}>
                        {statusLabel(p.status)}
                      </p>
                      <h2 className="t-h3" style={{ marginBottom: 6 }}>
                        {p.name}
                      </h2>
                      <p
                        className="t-small"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        被評価者 {Number(p.subjectsCount ?? 0)} 名 ・ 評価者 {total} 名
                      </p>
                    </div>
                    <div style={{ minWidth: 200 }}>
                      <p
                        className="t-small"
                        style={{ color: "var(--color-text-muted)", marginBottom: 6, textAlign: "right" }}
                      >
                        提出 {submitted} / {total}（{pct}%）
                      </p>
                      <div
                        style={{
                          width: "100%",
                          height: 8,
                          borderRadius: 999,
                          background: "var(--color-surface-2)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: "var(--color-text)",
                            transition: "width 300ms",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

function BreadCrumb() {
  return (
    <p
      className="t-small"
      style={{ color: "var(--color-text-muted)", marginBottom: 8 }}
    >
      <Link href="/me" style={{ color: "var(--color-text-muted)", textDecoration: "none" }}>
        マイページ
      </Link>{" "}
      / 管理者
    </p>
  );
}

function statusLabel(s: string): string {
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
