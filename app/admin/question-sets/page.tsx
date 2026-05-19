import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/test-mode";
import { db } from "@/db/client";
import {
  questionSets,
  categories,
  questions,
  projects,
} from "@/db/schema";
import { eq, ne, and, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function QuestionSetsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) redirect("/me");

  const sp = await searchParams;

  const rows = await db
    .select({
      id: questionSets.id,
      name: questionSets.name,
      version: questionSets.version,
      isDefault: questionSets.isDefault,
      createdAt: questionSets.createdAt,
      categoryCount: sql<number>`COUNT(DISTINCT ${categories.id})`.as("category_count"),
      questionCount: sql<number>`COUNT(DISTINCT ${questions.id})`.as("question_count"),
    })
    .from(questionSets)
    .leftJoin(categories, eq(categories.questionSetId, questionSets.id))
    .leftJoin(questions, eq(questions.categoryId, categories.id))
    .groupBy(questionSets.id)
    .orderBy(questionSets.createdAt);

  // 各 qset を使っているプロジェクト数
  const usage = await db
    .select({
      questionSetId: projects.questionSetId,
      count: sql<number>`COUNT(*)`.as("c"),
    })
    .from(projects)
    .groupBy(projects.questionSetId);
  const usageMap = new Map<number, number>();
  for (const u of usage) {
    if (u.questionSetId == null) continue;
    usageMap.set(u.questionSetId, Number(u.count));
  }

  async function makeDefault(formData: FormData) {
    "use server";
    const qid = Number(formData.get("qid"));
    if (!qid) return;
    await db.update(questionSets).set({ isDefault: false }).where(ne(questionSets.id, qid));
    await db.update(questionSets).set({ isDefault: true }).where(eq(questionSets.id, qid));
    revalidatePath("/admin/question-sets");
    redirect("/admin/question-sets?msg=default-changed");
  }

  async function createBlank(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const version = String(formData.get("version") ?? "1").trim() || "1";
    if (!name) return;
    const inserted = await db
      .insert(questionSets)
      .values({ name, version, isDefault: false })
      .returning();
    redirect(`/admin/question-sets/${inserted[0].id}`);
  }

  async function duplicate(formData: FormData) {
    "use server";
    const srcId = Number(formData.get("qid"));
    if (!srcId) return;
    const src = await db.query.questionSets.findFirst({ where: eq(questionSets.id, srcId) });
    if (!src) return;
    const newName = src.name.replace(/\s*\(コピー\)$/, "") + " (コピー)";
    const [created] = await db
      .insert(questionSets)
      .values({
        name: newName,
        version: incrementVersion(src.version),
        isDefault: false,
      })
      .returning();
    const cats = await db.query.categories.findMany({
      where: eq(categories.questionSetId, srcId),
      orderBy: (c, { asc }) => [asc(c.orderIndex)],
    });
    for (const cat of cats) {
      const [newCat] = await db
        .insert(categories)
        .values({
          questionSetId: created.id,
          name: cat.name,
          description: cat.description,
          orderIndex: cat.orderIndex,
        })
        .returning();
      const qs = await db.query.questions.findMany({
        where: eq(questions.categoryId, cat.id),
        orderBy: (q, { asc }) => [asc(q.orderIndex)],
      });
      for (const q of qs) {
        await db.insert(questions).values({
          categoryId: newCat.id,
          body: q.body,
          responseType: q.responseType,
          scaleMin: q.scaleMin,
          scaleMax: q.scaleMax,
          orderIndex: q.orderIndex,
          required: q.required,
        });
      }
    }
    redirect(`/admin/question-sets/${created.id}`);
  }

  async function destroy(formData: FormData) {
    "use server";
    const qid = Number(formData.get("qid"));
    if (!qid) return;
    // 使われていなければ削除可能
    const used = await db.query.projects.findFirst({
      where: eq(projects.questionSetId, qid),
    });
    if (used) {
      redirect(`/admin/question-sets?msg=in-use`);
    }
    await db.delete(questionSets).where(eq(questionSets.id, qid));
    revalidatePath("/admin/question-sets");
    redirect("/admin/question-sets?msg=deleted");
  }

  const banner = bannerFor(sp.msg);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 24px",
        maxWidth: 1000,
        margin: "0 auto",
      }}
    >
      <p
        className="t-small"
        style={{ color: "var(--color-text-muted)", marginBottom: 8 }}
      >
        <Link
          href="/admin/projects"
          style={{
            color: "var(--color-text-muted)",
            textDecoration: "none",
            marginRight: 16,
          }}
        >
          ← プロジェクト
        </Link>
        / 設問テンプレート
      </p>

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <h1 className="t-h1">設問テンプレート</h1>
      </header>

      {banner ? (
        <div
          className="card-nested"
          style={{
            marginBottom: 16,
            background: "var(--color-surface-2)",
            padding: "10px 14px",
          }}
        >
          <p className="t-small" style={{ color: banner.color }}>{banner.text}</p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="card">
          <p className="t-body">まだテンプレートがありません。</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
          {rows.map((q) => {
            const used = usageMap.get(q.id) ?? 0;
            return (
              <div key={q.id} className="card">
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
                      v{q.version}
                      {q.isDefault ? " ・ デフォルト" : ""}
                    </p>
                    <h2 className="t-h3" style={{ marginBottom: 4 }}>
                      <Link
                        href={`/admin/question-sets/${q.id}`}
                        style={{ color: "var(--color-text)", textDecoration: "none" }}
                      >
                        {q.name}
                      </Link>
                    </h2>
                    <p className="t-small" style={{ color: "var(--color-text-muted)" }}>
                      {Number(q.categoryCount ?? 0)} カテゴリ ／ {Number(q.questionCount ?? 0)} 設問
                      {used > 0 ? `  ／  ${used} プロジェクトで使用中` : ""}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!q.isDefault ? (
                      <form action={makeDefault}>
                        <input type="hidden" name="qid" value={q.id} />
                        <button type="submit" className="btn btn-secondary">
                          デフォルトにする
                        </button>
                      </form>
                    ) : null}
                    <Link
                      href={`/admin/question-sets/${q.id}`}
                      className="btn btn-secondary"
                    >
                      編集
                    </Link>
                    <form action={duplicate}>
                      <input type="hidden" name="qid" value={q.id} />
                      <button type="submit" className="btn btn-secondary">
                        複製
                      </button>
                    </form>
                    {used === 0 && !q.isDefault ? (
                      <form action={destroy}>
                        <input type="hidden" name="qid" value={q.id} />
                        <button
                          type="submit"
                          className="btn btn-secondary"
                          style={{ color: "var(--color-error)" }}
                        >
                          削除
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section
        style={{
          padding: 16,
          background: "var(--color-surface-2)",
          borderRadius: "var(--r)",
        }}
      >
        <h2 className="t-h4" style={{ marginBottom: 12 }}>
          新規テンプレートを作る
        </h2>
        <form action={createBlank} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            className="input"
            name="name"
            placeholder="テンプレート名"
            required
            style={{ flex: "1 1 240px", padding: "8px 12px", fontSize: "0.875rem" }}
          />
          <input
            className="input"
            name="version"
            placeholder="バージョン (例: 1)"
            defaultValue="1"
            style={{ flex: "0 0 140px", padding: "8px 12px", fontSize: "0.875rem" }}
          />
          <button type="submit" className="btn btn-primary">
            空のテンプレートを作る
          </button>
        </form>
        <p
          className="t-caption"
          style={{ color: "var(--color-text-muted)", marginTop: 8 }}
        >
          既存テンプレを参考にしたい場合は、上の一覧から「複製」を使うと中身ごとコピーされます。
        </p>
      </section>
    </main>
  );
}

function bannerFor(msg: string | undefined): { text: string; color: string } | null {
  if (!msg) return null;
  switch (msg) {
    case "default-changed": return { text: "デフォルトテンプレートを変更しました。", color: "var(--color-success)" };
    case "deleted": return { text: "テンプレートを削除しました。", color: "var(--color-text-muted)" };
    case "in-use": return { text: "プロジェクトで使用中のため削除できません。", color: "var(--color-error)" };
    default: return null;
  }
}

function incrementVersion(v: string): string {
  const m = v.match(/^(\d+)$/);
  if (m) return String(Number(m[1]) + 1);
  return v + ".1";
}
