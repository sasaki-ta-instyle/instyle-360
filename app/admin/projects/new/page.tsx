import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/test-mode";
import { db } from "@/db/client";
import { projects, questionSets } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AdminProjectsNewPage() {
  const me = await getCurrentUser();
  if (!me?.isAdmin) {
    redirect("/me");
  }

  const qsets = await db.query.questionSets.findMany({
    orderBy: (q, { desc: d }) => [d(q.createdAt)],
  });

  async function create(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const questionSetId = Number(formData.get("questionSetId") ?? 0) || null;
    const closesAt = String(formData.get("closesAt") ?? "");
    if (!name) return;
    const inserted = await db
      .insert(projects)
      .values({
        name,
        description,
        status: "draft",
        questionSetId,
        createdByUserId: (await getCurrentUser())?.id ?? null,
        opensAt: new Date(),
        closesAt: closesAt ? new Date(closesAt) : null,
      })
      .returning();
    redirect(`/admin/projects/${inserted[0].id}`);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 24px",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      <p className="t-small" style={{ color: "var(--color-text-muted)", marginBottom: 8 }}>
        <Link href="/admin/projects" style={{ color: "var(--color-text-muted)", textDecoration: "none" }}>
          ← プロジェクト一覧
        </Link>
      </p>
      <h1 className="t-h1" style={{ marginBottom: 24 }}>
        新規プロジェクト
      </h1>

      <form action={create}>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label className="field">
            <span className="field-label">プロジェクト名</span>
            <input className="input" name="name" required placeholder="2026 上期 360 評価" />
          </label>
          <label className="field">
            <span className="field-label">説明</span>
            <textarea
              className="input"
              name="description"
              rows={3}
              placeholder="目的・対象・期待する効果など"
              style={{ resize: "vertical", paddingTop: 12, paddingBottom: 12 }}
            />
          </label>
          <label className="field">
            <span className="field-label">設問テンプレート</span>
            <select className="input" name="questionSetId" required>
              {qsets.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                  {q.isDefault ? "（デフォルト）" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">回答締切（任意）</span>
            <input className="input" name="closesAt" type="date" />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="submit" className="btn btn-primary">
              下書きとして作成
            </button>
            <Link href="/admin/projects" className="btn btn-secondary">
              キャンセル
            </Link>
          </div>
          <p
            className="t-caption"
            style={{ color: "var(--color-text-light)", marginTop: 4 }}
          >
            作成後の画面で 被評価者・評価者を割り当て、ステータスを「回答受付中」に切り替えます。
          </p>
        </div>
      </form>
    </main>
  );
}
