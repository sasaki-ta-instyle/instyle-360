import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/test-mode";
import { db } from "@/db/client";
import { projects, subjects, raters, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) {
    redirect("/me");
  }
  const { id: idParam } = await params;
  const projectId = Number(idParam);
  if (!Number.isFinite(projectId)) notFound();

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) notFound();

  // 被評価者一覧 + 各 subject の評価者集計
  const subjectRows = await db
    .select({
      subjectId: subjects.id,
      userId: subjects.userId,
      displayName: users.displayName,
      email: users.email,
      department: subjects.departmentSnapshot,
      position: subjects.positionSnapshot,
    })
    .from(subjects)
    .innerJoin(users, eq(subjects.userId, users.id))
    .where(eq(subjects.projectId, projectId));

  const ratersBySubject = new Map<
    number,
    { id: number; relation: string; status: string; userId: string; displayName: string | null }[]
  >();
  if (subjectRows.length > 0) {
    const subjectIds = subjectRows.map((s) => s.subjectId);
    const fullList = await db
      .select({
        id: raters.id,
        subjectId: raters.subjectId,
        relation: raters.relation,
        status: raters.status,
        userId: raters.userId,
        displayName: users.displayName,
      })
      .from(raters)
      .innerJoin(users, eq(raters.userId, users.id));
    for (const r of fullList) {
      if (!subjectIds.includes(r.subjectId)) continue;
      const list = ratersBySubject.get(r.subjectId) ?? [];
      list.push(r);
      ratersBySubject.set(r.subjectId, list);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 24px",
        maxWidth: 1080,
        margin: "0 auto",
      }}
    >
      <p className="t-small" style={{ color: "var(--color-text-muted)", marginBottom: 8 }}>
        <Link href="/admin/projects" style={{ color: "var(--color-text-muted)", textDecoration: "none" }}>
          ← プロジェクト一覧
        </Link>
      </p>

      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          {statusLabel(project.status)}
        </p>
        <h1 className="t-h1">{project.name}</h1>
        {project.description ? (
          <p className="t-body" style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
            {project.description}
          </p>
        ) : null}
        <p className="t-small" style={{ color: "var(--color-text-light)", marginTop: 8 }}>
          {project.opensAt ? `開始 ${formatDate(project.opensAt)}` : ""}
          {project.closesAt ? `  ／  締切 ${formatDate(project.closesAt)}` : ""}
        </p>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2 className="t-h3" style={{ marginBottom: 12 }}>被評価者と評価者</h2>
        {subjectRows.length === 0 ? (
          <div className="card">
            <p className="t-body" style={{ color: "var(--color-text-muted)" }}>
              まだ被評価者が割り当てられていません。Phase 1 の今後の作業で割当 UI を追加します。
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {subjectRows.map((s) => {
              const rs = ratersBySubject.get(s.subjectId) ?? [];
              const submitted = rs.filter((r) => r.status === "submitted").length;
              return (
                <div key={s.subjectId} className="card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 16,
                      flexWrap: "wrap",
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <h3 className="t-h4" style={{ marginBottom: 4 }}>
                        {s.displayName ?? s.email}
                      </h3>
                      <p className="t-small" style={{ color: "var(--color-text-muted)" }}>
                        {s.department ?? "—"} ・ {s.position ?? "—"}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p className="t-small" style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>
                        提出 {submitted} / {rs.length}
                      </p>
                      <Link href={`/results/${s.subjectId}`} className="btn btn-secondary">
                        結果を見る
                      </Link>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {rs.map((r) => (
                      <span
                        key={r.id}
                        className="t-small card-nested"
                        style={{ padding: "4px 12px", margin: 0 }}
                      >
                        {relationLabel(r.relation)} ・ {r.displayName ?? r.userId}
                        <StatusDot status={r.status} />
                      </span>
                    ))}
                    {rs.length === 0 ? (
                      <span className="t-small" style={{ color: "var(--color-text-muted)" }}>
                        評価者未割当
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="t-h3" style={{ marginBottom: 12 }}>今後の運用操作</h2>
        <div className="card">
          <p className="t-body" style={{ color: "var(--color-text-muted)", marginBottom: 8 }}>
            次の操作は Phase 1 の後半で追加します。
          </p>
          <ul style={{ paddingLeft: 20, color: "var(--color-text-muted)" }}>
            <li className="t-small">被評価者・評価者の追加 / 編集</li>
            <li className="t-small">ステータスを「下書き → 受付中 → 締切済み」に進める</li>
            <li className="t-small">メール通知の手動再送・締切前リマインダー</li>
            <li className="t-small">Excel / PDF 出力（Phase 2）</li>
          </ul>
        </div>
      </section>
    </main>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case "draft": return "下書き";
    case "open": return "回答受付中";
    case "closed": return "締切済み";
    case "archived": return "アーカイブ";
    default: return s;
  }
}

function relationLabel(r: string): string {
  switch (r) {
    case "self": return "自己";
    case "boss": return "上司";
    case "peer": return "同僚";
    case "subordinate": return "部下";
    default: return r;
  }
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "submitted"
      ? "var(--color-success)"
      : status === "in_progress"
      ? "var(--color-warning)"
      : "var(--color-text-light)";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        marginLeft: 8,
        verticalAlign: "middle",
      }}
    />
  );
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}
