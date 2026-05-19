import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import {
  raters,
  subjects,
  projects,
  users,
  categories,
  questions,
  answers,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AnswerPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const saved = sp.saved === "1";

  // 1) rater + subject + project + subject user の名前
  const rater = await db.query.raters.findFirst({
    where: eq(raters.token, token),
  });
  if (!rater) notFound();

  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, rater.subjectId),
  });
  if (!subject) notFound();

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, subject.projectId),
  });
  if (!project) notFound();

  const subjectUser = await db.query.users.findFirst({
    where: eq(users.id, subject.userId),
  });
  if (!subjectUser) notFound();

  if (!project.questionSetId) {
    return (
      <main style={pageStyle}>
        <div className="card">
          <p className="t-body">このプロジェクトには設問が設定されていません。</p>
        </div>
      </main>
    );
  }

  // 2) categories + questions（DB 側で絞る）
  const cats = await db.query.categories.findMany({
    where: eq(categories.questionSetId, project.questionSetId),
    orderBy: (c, { asc }) => [asc(c.orderIndex)],
  });
  const catIds = cats.map((c) => c.id);
  const allQuestions = catIds.length
    ? await db.query.questions.findMany({
        where: inArray(questions.categoryId, catIds),
        orderBy: (q, { asc }) => [asc(q.orderIndex)],
      })
    : [];
  const questionsByCat = new Map<number, typeof allQuestions>();
  for (const q of allQuestions) {
    const list = questionsByCat.get(q.categoryId) ?? [];
    list.push(q);
    questionsByCat.set(q.categoryId, list);
  }

  // このプロジェクトで保存を許す質問 ID のホワイトリスト
  // 他プロジェクトの question ID を偽装したリクエストを弾くために使う
  const validQuestionIds = new Set(allQuestions.map((q) => q.id));

  // 3) 既存の answers
  const existing = await db.query.answers.findMany({
    where: eq(answers.raterId, rater.id),
  });
  const ansMap = new Map<number, (typeof existing)[number]>();
  for (const a of existing) ansMap.set(a.questionId, a);

  // ── server actions ───────────────────────
  async function saveDraft(formData: FormData) {
    "use server";
    await persistAnswers({
      raterId: rater!.id,
      formData,
      validQuestionIds,
    });
    await db
      .update(raters)
      .set({ status: rater!.status === "submitted" ? "submitted" : "in_progress" })
      .where(eq(raters.id, rater!.id));
    redirect(`/answer/${rater!.token}?saved=1`);
  }

  async function submitFinal(formData: FormData) {
    "use server";
    await persistAnswers({
      raterId: rater!.id,
      formData,
      validQuestionIds,
    });
    await db
      .update(raters)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(eq(raters.id, rater!.id));
    redirect(`/answer/${rater!.token}?saved=1`);
  }
  // ─────────────────────────────────────────

  const relLabel = relationLabel(rater.relation);
  const subjectName = subjectUser.displayName ?? subjectUser.email;

  return (
    <main style={pageStyle}>
      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          {project.name}
        </p>
        <h1 className="t-h1" style={{ marginBottom: 8 }}>
          {subjectName} さんの 360 評価
        </h1>
        <p className="t-small" style={{ color: "var(--color-text-muted)" }}>
          関係: {relLabel} ／ 現在のステータス: <StatusBadge status={rater.status} />
        </p>
      </header>

      {saved ? (
        <div
          className="card-nested"
          style={{
            background: "var(--color-surface-2)",
            color: "var(--color-success)",
            marginBottom: 16,
          }}
        >
          <p className="t-small">保存しました。</p>
        </div>
      ) : null}

      <form>
        {cats.map((cat) => (
          <section key={cat.id} style={{ marginBottom: 24 }}>
            <h2 className="t-h3" style={{ marginBottom: 4 }}>
              {cat.name}
            </h2>
            {cat.description ? (
              <p
                className="t-small"
                style={{ color: "var(--color-text-muted)", marginBottom: 16 }}
              >
                {cat.description}
              </p>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(questionsByCat.get(cat.id) ?? []).map((q) => {
                const a = ansMap.get(q.id);
                return (
                  <div key={q.id} className="card-nested">
                    <p className="t-body" style={{ marginBottom: 12 }}>
                      {q.body}
                      {q.required ? (
                        <span
                          className="t-caption"
                          style={{ color: "var(--color-error)", marginLeft: 6 }}
                        >
                          必須
                        </span>
                      ) : null}
                    </p>
                    {q.responseType === "scale" ? (
                      <ScaleField
                        name={`scale_${q.id}`}
                        min={q.scaleMin}
                        max={q.scaleMax}
                        defaultValue={a?.scaleValue ?? null}
                      />
                    ) : (
                      <textarea
                        className="input"
                        name={`text_${q.id}`}
                        rows={4}
                        defaultValue={a?.textValue ?? ""}
                        placeholder="自由に記述してください"
                        style={{ resize: "vertical", paddingTop: 12, paddingBottom: 12 }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            position: "sticky",
            bottom: 16,
            paddingTop: 16,
          }}
        >
          <button formAction={saveDraft} className="btn btn-secondary">
            下書き保存
          </button>
          <button formAction={submitFinal} className="btn btn-primary">
            回答を提出する
          </button>
        </div>
      </form>

      <footer style={{ marginTop: 32 }}>
        <p className="t-caption" style={{ color: "var(--color-text-light)", textAlign: "center" }}>
          提出後も締切前なら何度でも更新できます。
        </p>
        <p
          className="t-caption"
          style={{ color: "var(--color-text-light)", textAlign: "center", marginTop: 4 }}
        >
          <Link
            href="/me"
            style={{ color: "var(--color-text-muted)", textDecoration: "none" }}
          >
            ← マイページに戻る
          </Link>
        </p>
      </footer>
    </main>
  );
}

async function persistAnswers({
  raterId,
  formData,
  validQuestionIds,
}: {
  raterId: number;
  formData: FormData;
  validQuestionIds: Set<number>;
}) {
  const tasks: Promise<unknown>[] = [];
  for (const [k, vRaw] of formData.entries()) {
    const v = String(vRaw);
    let qid: number | null = null;
    let scale: number | null = null;
    let text: string | null = null;
    if (k.startsWith("scale_")) {
      qid = Number(k.slice(6));
      if (v === "") continue;
      scale = Number(v);
      if (!Number.isFinite(scale)) continue;
    } else if (k.startsWith("text_")) {
      qid = Number(k.slice(5));
      text = v.trim();
      if (text.length === 0) continue;
    } else {
      continue;
    }
    if (!qid) continue;

    // 別プロジェクトの question_id を偽装したリクエストを弾く
    if (!validQuestionIds.has(qid)) continue;

    tasks.push(
      (async () => {
        const existing = await db.query.answers.findFirst({
          where: and(eq(answers.raterId, raterId), eq(answers.questionId, qid!)),
        });
        if (existing) {
          await db
            .update(answers)
            .set({
              scaleValue: scale,
              textValue: text,
              updatedAt: new Date(),
            })
            .where(eq(answers.id, existing.id));
        } else {
          await db.insert(answers).values({
            raterId,
            questionId: qid!,
            scaleValue: scale,
            textValue: text,
          });
        }
      })(),
    );
  }
  await Promise.all(tasks);
}

function ScaleField({
  name,
  min,
  max,
  defaultValue,
}: {
  name: string;
  min: number;
  max: number;
  defaultValue: number | null;
}) {
  const opts: number[] = [];
  for (let i = min; i <= max; i++) opts.push(i);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {opts.map((v) => {
        const id = `${name}_${v}`;
        const checked = defaultValue === v;
        return (
          <label
            key={v}
            htmlFor={id}
            style={{
              flex: "1 1 80px",
              minWidth: 60,
              padding: "10px 16px",
              borderRadius: 999,
              background: checked ? "var(--color-text)" : "var(--color-bg)",
              color: checked ? "var(--color-text-inverse)" : "var(--color-text)",
              border: `1px solid ${checked ? "var(--color-text)" : "var(--color-border)"}`,
              cursor: "pointer",
              textAlign: "center",
              fontWeight: checked ? 600 : 400,
              fontSize: "0.875rem",
              transition: "all 200ms",
            }}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={v}
              defaultChecked={checked}
              style={{ display: "none" }}
            />
            {v} — {scaleLabel(v, min, max)}
          </label>
        );
      })}
    </div>
  );
}

function scaleLabel(v: number, min: number, max: number): string {
  if (max - min === 4) {
    return ["全くそう思わない", "あまりそう思わない", "どちらでもない", "そう思う", "強くそう思う"][v - min];
  }
  return "";
}

function relationLabel(r: string): string {
  switch (r) {
    case "self": return "自己評価";
    case "boss": return "上司から";
    case "peer": return "同僚から";
    case "subordinate": return "部下から";
    default: return r;
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

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: "48px 24px",
  maxWidth: 720,
  margin: "0 auto",
};
