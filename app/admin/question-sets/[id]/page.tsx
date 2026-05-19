import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/test-mode";
import { db } from "@/db/client";
import {
  questionSets,
  categories,
  questions,
  projects,
} from "@/db/schema";
import { eq, and, asc, desc, ne, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function QuestionSetEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; focus?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) redirect("/me");

  const { id } = await params;
  const sp = await searchParams;
  const qid = Number(id);
  if (!Number.isFinite(qid)) notFound();

  const qset = await db.query.questionSets.findFirst({ where: eq(questionSets.id, qid) });
  if (!qset) notFound();

  // categories
  const cats = await db.query.categories.findMany({
    where: eq(categories.questionSetId, qid),
    orderBy: (c, { asc: a }) => [a(c.orderIndex)],
  });
  const catIds = cats.map((c) => c.id);

  // questions
  const qs = catIds.length
    ? await db.query.questions.findMany({
        orderBy: (q, { asc: a }) => [a(q.orderIndex)],
      })
    : [];
  const qsByCat = new Map<number, typeof qs>();
  for (const q of qs) {
    if (!catIds.includes(q.categoryId)) continue;
    const arr = qsByCat.get(q.categoryId) ?? [];
    arr.push(q);
    qsByCat.set(q.categoryId, arr);
  }

  // 使用中プロジェクト
  const usingProjects = await db.query.projects.findMany({
    where: eq(projects.questionSetId, qid),
  });

  /* ────────────────────────────────────────
   * Server Actions
   * ──────────────────────────────────────── */

  async function updateMeta(formData: FormData) {
    "use server";
    const qid = Number(formData.get("qid"));
    if (!qid) return;
    const name = String(formData.get("name") ?? "").trim();
    const version = String(formData.get("version") ?? "").trim() || "1";
    const isDefault = formData.get("isDefault") === "on";
    if (!name) return;
    if (isDefault) {
      await db.update(questionSets).set({ isDefault: false }).where(ne(questionSets.id, qid));
    }
    await db
      .update(questionSets)
      .set({ name, version, isDefault })
      .where(eq(questionSets.id, qid));
    revalidatePath(`/admin/question-sets/${qid}`);
    redirect(`/admin/question-sets/${qid}?msg=meta-saved`);
  }

  async function addCategoryAction(formData: FormData) {
    "use server";
    const qid = Number(formData.get("qid"));
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    if (!qid || !name) return;
    const maxRow = await db
      .select({ max: sql<number>`COALESCE(MAX(${categories.orderIndex}), -1)` })
      .from(categories)
      .where(eq(categories.questionSetId, qid));
    const nextOrder = Number(maxRow[0]?.max ?? -1) + 1;
    await db.insert(categories).values({
      questionSetId: qid,
      name,
      description: description || null,
      orderIndex: nextOrder,
    });
    revalidatePath(`/admin/question-sets/${qid}`);
    redirect(`/admin/question-sets/${qid}?msg=cat-added`);
  }

  async function updateCategory(formData: FormData) {
    "use server";
    const qid = Number(formData.get("qid"));
    const cid = Number(formData.get("cid"));
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    if (!cid || !name) return;
    await db
      .update(categories)
      .set({ name, description: description || null })
      .where(eq(categories.id, cid));
    revalidatePath(`/admin/question-sets/${qid}`);
    redirect(`/admin/question-sets/${qid}?msg=cat-saved&focus=c-${cid}`);
  }

  async function moveCategory(formData: FormData) {
    "use server";
    const qid = Number(formData.get("qid"));
    const cid = Number(formData.get("cid"));
    const dir = String(formData.get("dir") ?? "");
    if (!qid || !cid || !["up", "down"].includes(dir)) return;
    const current = await db.query.categories.findFirst({ where: eq(categories.id, cid) });
    if (!current) return;
    const neighbor =
      dir === "up"
        ? await db.query.categories.findFirst({
            where: and(
              eq(categories.questionSetId, qid),
              sql`${categories.orderIndex} < ${current.orderIndex}`,
            ),
            orderBy: (c, { desc: d }) => [d(c.orderIndex)],
          })
        : await db.query.categories.findFirst({
            where: and(
              eq(categories.questionSetId, qid),
              sql`${categories.orderIndex} > ${current.orderIndex}`,
            ),
            orderBy: (c, { asc: a }) => [a(c.orderIndex)],
          });
    if (!neighbor) {
      redirect(`/admin/question-sets/${qid}`);
    }
    // swap order
    await db
      .update(categories)
      .set({ orderIndex: -1 - current.id })
      .where(eq(categories.id, current.id));
    await db
      .update(categories)
      .set({ orderIndex: current.orderIndex })
      .where(eq(categories.id, neighbor!.id));
    await db
      .update(categories)
      .set({ orderIndex: neighbor!.orderIndex })
      .where(eq(categories.id, current.id));
    revalidatePath(`/admin/question-sets/${qid}`);
    redirect(`/admin/question-sets/${qid}?focus=c-${cid}`);
  }

  async function deleteCategoryAction(formData: FormData) {
    "use server";
    const qid = Number(formData.get("qid"));
    const cid = Number(formData.get("cid"));
    if (!cid) return;
    await db.delete(categories).where(eq(categories.id, cid));
    revalidatePath(`/admin/question-sets/${qid}`);
    redirect(`/admin/question-sets/${qid}?msg=cat-deleted`);
  }

  async function addQuestionAction(formData: FormData) {
    "use server";
    const qid = Number(formData.get("qid"));
    const cid = Number(formData.get("cid"));
    const body = String(formData.get("body") ?? "").trim();
    const responseType = String(formData.get("responseType") ?? "scale");
    const required = formData.get("required") === "on";
    if (!cid || !body) return;
    const maxRow = await db
      .select({ max: sql<number>`COALESCE(MAX(${questions.orderIndex}), -1)` })
      .from(questions)
      .where(eq(questions.categoryId, cid));
    const nextOrder = Number(maxRow[0]?.max ?? -1) + 1;
    await db.insert(questions).values({
      categoryId: cid,
      body,
      responseType: responseType === "free_text" ? "free_text" : "scale",
      scaleMin: 1,
      scaleMax: 5,
      orderIndex: nextOrder,
      required,
    });
    revalidatePath(`/admin/question-sets/${qid}`);
    redirect(`/admin/question-sets/${qid}?msg=q-added&focus=c-${cid}`);
  }

  async function updateQuestion(formData: FormData) {
    "use server";
    const qid = Number(formData.get("qid"));
    const questionId = Number(formData.get("questionId"));
    const cid = Number(formData.get("cid"));
    const body = String(formData.get("body") ?? "").trim();
    const responseType = String(formData.get("responseType") ?? "scale");
    const required = formData.get("required") === "on";
    if (!questionId || !body) return;
    await db
      .update(questions)
      .set({
        body,
        responseType: responseType === "free_text" ? "free_text" : "scale",
        required,
      })
      .where(eq(questions.id, questionId));
    revalidatePath(`/admin/question-sets/${qid}`);
    redirect(`/admin/question-sets/${qid}?msg=q-saved&focus=c-${cid}`);
  }

  async function moveQuestion(formData: FormData) {
    "use server";
    const qid = Number(formData.get("qid"));
    const questionId = Number(formData.get("questionId"));
    const dir = String(formData.get("dir") ?? "");
    if (!questionId || !["up", "down"].includes(dir)) return;
    const cur = await db.query.questions.findFirst({ where: eq(questions.id, questionId) });
    if (!cur) return;
    const neighbor =
      dir === "up"
        ? await db.query.questions.findFirst({
            where: and(
              eq(questions.categoryId, cur.categoryId),
              sql`${questions.orderIndex} < ${cur.orderIndex}`,
            ),
            orderBy: (c, { desc: d }) => [d(c.orderIndex)],
          })
        : await db.query.questions.findFirst({
            where: and(
              eq(questions.categoryId, cur.categoryId),
              sql`${questions.orderIndex} > ${cur.orderIndex}`,
            ),
            orderBy: (c, { asc: a }) => [a(c.orderIndex)],
          });
    if (!neighbor) {
      redirect(`/admin/question-sets/${qid}`);
    }
    await db
      .update(questions)
      .set({ orderIndex: -1 - cur.id })
      .where(eq(questions.id, cur.id));
    await db
      .update(questions)
      .set({ orderIndex: cur.orderIndex })
      .where(eq(questions.id, neighbor!.id));
    await db
      .update(questions)
      .set({ orderIndex: neighbor!.orderIndex })
      .where(eq(questions.id, cur.id));
    revalidatePath(`/admin/question-sets/${qid}`);
    redirect(`/admin/question-sets/${qid}?focus=c-${cur.categoryId}`);
  }

  async function deleteQuestionAction(formData: FormData) {
    "use server";
    const qid = Number(formData.get("qid"));
    const questionId = Number(formData.get("questionId"));
    const cid = Number(formData.get("cid"));
    if (!questionId) return;
    await db.delete(questions).where(eq(questions.id, questionId));
    revalidatePath(`/admin/question-sets/${qid}`);
    redirect(`/admin/question-sets/${qid}?msg=q-deleted&focus=c-${cid}`);
  }

  /* ────────────────────────────────────────
   * View
   * ──────────────────────────────────────── */

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
          href="/admin/question-sets"
          style={{ color: "var(--color-text-muted)", textDecoration: "none" }}
        >
          ← 設問テンプレート一覧
        </Link>
      </p>

      {banner ? (
        <div
          className="card-nested"
          style={{
            marginBottom: 16,
            background: "var(--color-surface-2)",
            padding: "10px 14px",
          }}
        >
          <p className="t-small" style={{ color: banner.color }}>
            {banner.text}
          </p>
        </div>
      ) : null}

      {/* メタデータフォーム */}
      <form action={updateMeta} style={{ marginBottom: 24 }}>
        <input type="hidden" name="qid" value={qid} />
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            テンプレート
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 140px",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <label className="field">
              <span className="field-label">名前</span>
              <input className="input" name="name" defaultValue={qset.name} required />
            </label>
            <label className="field">
              <span className="field-label">バージョン</span>
              <input className="input" name="version" defaultValue={qset.version} required />
            </label>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <label
              className="t-small"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <input
                type="checkbox"
                name="isDefault"
                defaultChecked={qset.isDefault}
              />
              新規プロジェクトのデフォルトにする
            </label>
            <button type="submit" className="btn btn-primary" style={{ marginLeft: "auto" }}>
              保存
            </button>
          </div>
        </div>
      </form>

      {usingProjects.length > 0 ? (
        <div
          className="card-nested"
          style={{
            background: "var(--color-surface-2)",
            padding: "10px 14px",
            marginBottom: 24,
            color: "var(--color-warning)",
          }}
        >
          <p className="t-small">
            ⚠ このテンプレートは <strong>{usingProjects.length} 件のプロジェクト</strong>
            で使用中です。設問を編集すると既存プロジェクトの集計表示にも影響します。
            別バージョンを作る場合は一覧画面で「複製」を使ってください。
          </p>
        </div>
      ) : null}

      {/* カテゴリ一覧 */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {cats.map((c, ci) => {
          const myQs = qsByCat.get(c.id) ?? [];
          const isFirst = ci === 0;
          const isLast = ci === cats.length - 1;
          return (
            <div key={c.id} id={`c-${c.id}`} className="card">
              {/* カテゴリヘッダー（編集フォーム） */}
              <form action={updateCategory}>
                <input type="hidden" name="qid" value={qid} />
                <input type="hidden" name="cid" value={c.id} />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr 1fr auto",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <FormButton
                      action={moveCategory}
                      hidden={{ qid, cid: c.id, dir: "up" }}
                      disabled={isFirst}
                    >
                      ↑
                    </FormButton>
                    <FormButton
                      action={moveCategory}
                      hidden={{ qid, cid: c.id, dir: "down" }}
                      disabled={isLast}
                    >
                      ↓
                    </FormButton>
                  </div>
                  <input
                    className="input"
                    name="name"
                    defaultValue={c.name}
                    required
                    style={{ padding: "8px 12px", fontSize: "1rem", fontWeight: 600 }}
                  />
                  <input
                    className="input"
                    name="description"
                    defaultValue={c.description ?? ""}
                    placeholder="補足（任意）"
                    style={{ padding: "8px 12px", fontSize: "0.875rem", color: "var(--color-text-muted)" }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="submit" className="btn btn-secondary">
                      保存
                    </button>
                  </div>
                </div>
              </form>

              {/* 質問一覧 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {myQs.map((q, qi) => {
                  const isFirstQ = qi === 0;
                  const isLastQ = qi === myQs.length - 1;
                  return (
                    <form
                      action={updateQuestion}
                      key={q.id}
                      style={{
                        padding: "8px 12px",
                        background: "var(--color-surface-2)",
                        borderRadius: "var(--r-sm)",
                      }}
                    >
                      <input type="hidden" name="qid" value={qid} />
                      <input type="hidden" name="questionId" value={q.id} />
                      <input type="hidden" name="cid" value={c.id} />
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "auto 1fr 120px auto auto auto",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <FormButton
                            action={moveQuestion}
                            hidden={{ qid, questionId: q.id, dir: "up" }}
                            disabled={isFirstQ}
                            small
                          >
                            ↑
                          </FormButton>
                          <FormButton
                            action={moveQuestion}
                            hidden={{ qid, questionId: q.id, dir: "down" }}
                            disabled={isLastQ}
                            small
                          >
                            ↓
                          </FormButton>
                        </div>
                        <textarea
                          name="body"
                          defaultValue={q.body}
                          rows={2}
                          required
                          className="input"
                          style={{
                            padding: "8px 12px",
                            fontSize: "0.875rem",
                            resize: "vertical",
                            background: "var(--color-bg)",
                          }}
                        />
                        <select
                          name="responseType"
                          defaultValue={q.responseType}
                          className="input"
                          style={{ padding: "8px 12px", fontSize: "0.875rem" }}
                        >
                          <option value="scale">スケール 1-5</option>
                          <option value="free_text">自由記述</option>
                        </select>
                        <label
                          className="t-caption"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <input type="checkbox" name="required" defaultChecked={q.required} />
                          必須
                        </label>
                        <button
                          type="submit"
                          className="btn btn-secondary"
                          style={{ padding: "6px 10px", fontSize: "0.786rem" }}
                        >
                          保存
                        </button>
                        <FormButton
                          action={deleteQuestionAction}
                          hidden={{ qid, questionId: q.id, cid: c.id }}
                          danger
                        >
                          ✕
                        </FormButton>
                      </div>
                    </form>
                  );
                })}

                {/* 質問追加 */}
                <form
                  action={addQuestionAction}
                  style={{
                    padding: "10px 12px",
                    background: "var(--color-bg)",
                    borderRadius: "var(--r-sm)",
                    border: "1px dashed var(--color-border)",
                  }}
                >
                  <input type="hidden" name="qid" value={qid} />
                  <input type="hidden" name="cid" value={c.id} />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 140px auto auto",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <input
                      className="input"
                      name="body"
                      placeholder="設問を追加（例: ＿＿＿に取り組んでいる）"
                      required
                      style={{ padding: "8px 12px", fontSize: "0.875rem" }}
                    />
                    <select
                      name="responseType"
                      defaultValue="scale"
                      className="input"
                      style={{ padding: "8px 12px", fontSize: "0.875rem" }}
                    >
                      <option value="scale">スケール 1-5</option>
                      <option value="free_text">自由記述</option>
                    </select>
                    <label
                      className="t-caption"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      <input type="checkbox" name="required" defaultChecked />
                      必須
                    </label>
                    <button
                      type="submit"
                      className="btn btn-secondary"
                      style={{ padding: "6px 12px", fontSize: "0.875rem" }}
                    >
                      ＋ 追加
                    </button>
                  </div>
                </form>
              </div>

              {/* カテゴリ削除 */}
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <FormButton
                  action={deleteCategoryAction}
                  hidden={{ qid, cid: c.id }}
                  danger
                  className="btn btn-secondary"
                  style={{ color: "var(--color-error)" }}
                >
                  カテゴリを削除（中の設問も含めて）
                </FormButton>
              </div>
            </div>
          );
        })}
      </section>

      {/* カテゴリ追加 */}
      <section
        style={{
          marginTop: 24,
          padding: 16,
          background: "var(--color-surface-2)",
          borderRadius: "var(--r)",
        }}
      >
        <h2 className="t-h4" style={{ marginBottom: 8 }}>
          カテゴリを追加
        </h2>
        <form action={addCategoryAction} style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr auto" }}>
          <input type="hidden" name="qid" value={qid} />
          <input
            className="input"
            name="name"
            placeholder="カテゴリ名（例: コミュニケーション）"
            required
            style={{ padding: "8px 12px", fontSize: "0.875rem" }}
          />
          <input
            className="input"
            name="description"
            placeholder="補足（任意）"
            style={{ padding: "8px 12px", fontSize: "0.875rem" }}
          />
          <button type="submit" className="btn btn-primary">
            ＋ 追加
          </button>
        </form>
      </section>
    </main>
  );
}

/* ────────────────────────────────────────
 * 共通 server-action button (form を入れ子にしないため)
 *
 * 注: 中に form を入れ子にできないので、独立した <form action={...}>
 *     を生成する。
 * ──────────────────────────────────────── */
function FormButton({
  action,
  hidden,
  children,
  disabled,
  danger,
  small,
  className,
  style,
}: {
  action: (formData: FormData) => Promise<void>;
  hidden: Record<string, string | number>;
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  small?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <form action={action} style={{ display: "inline" }}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      <button
        type="submit"
        disabled={disabled}
        className={className}
        style={{
          padding: small ? "2px 6px" : "4px 10px",
          fontSize: small ? "0.7rem" : "0.786rem",
          background: "transparent",
          border: `1px solid ${disabled ? "var(--color-text-light)" : "var(--color-border)"}`,
          borderRadius: 999,
          color: disabled
            ? "var(--color-text-light)"
            : danger
            ? "var(--color-error)"
            : "var(--color-text)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          ...style,
        }}
      >
        {children}
      </button>
    </form>
  );
}

function bannerFor(msg: string | undefined): { text: string; color: string } | null {
  if (!msg) return null;
  switch (msg) {
    case "meta-saved":
      return { text: "テンプレート情報を保存しました。", color: "var(--color-success)" };
    case "cat-added":
      return { text: "カテゴリを追加しました。", color: "var(--color-success)" };
    case "cat-saved":
      return { text: "カテゴリを保存しました。", color: "var(--color-success)" };
    case "cat-deleted":
      return { text: "カテゴリを削除しました。", color: "var(--color-text-muted)" };
    case "q-added":
      return { text: "設問を追加しました。", color: "var(--color-success)" };
    case "q-saved":
      return { text: "設問を保存しました。", color: "var(--color-success)" };
    case "q-deleted":
      return { text: "設問を削除しました。", color: "var(--color-text-muted)" };
    default:
      return null;
  }
}
