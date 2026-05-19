import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import {
  subjects,
  projects,
  users,
  categories,
  questions,
  raters,
  answers,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { RadarChart, type RadarSeries } from "@/components/RadarChart";
import { getCurrentUser } from "@/lib/test-mode";

export const dynamic = "force-dynamic";

const N_MIN = Number(process.env.ANONYMITY_MIN_RESPONSES ?? 3);

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId: subjIdParam } = await params;
  const subjectId = Number(subjIdParam);
  if (!Number.isFinite(subjectId)) notFound();

  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, subjectId),
  });
  if (!subject) notFound();

  // ── アクセス制御: 本人 or admin のみ ──
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in");
  if (!me.isAdmin && me.id !== subject.userId) {
    // 連番 URL 総当たりを防ぐ。他人の結果は見せない
    notFound();
  }

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
          <p>このプロジェクトには設問が設定されていません。</p>
        </div>
      </main>
    );
  }

  // categories
  const allCats = await db.query.categories.findMany({
    where: eq(categories.questionSetId, project.questionSetId),
    orderBy: (c, { asc }) => [asc(c.orderIndex)],
  });
  const catIds = allCats.map((c) => c.id);

  // questions（このテンプレに紐づくものだけ DB 側で絞る）
  const qInThisSet = catIds.length
    ? await db.query.questions.findMany({
        where: inArray(questions.categoryId, catIds),
        orderBy: (q, { asc }) => [asc(q.orderIndex)],
      })
    : [];
  const scaleQs = qInThisSet.filter((q) => q.responseType === "scale");
  const freeQs = qInThisSet.filter((q) => q.responseType === "free_text");
  const scaleCatIds = new Set(scaleQs.map((q) => q.categoryId));
  const cats = allCats.filter((c) => scaleCatIds.has(c.id));

  // raters
  const subjectRaters = await db.query.raters.findMany({
    where: eq(raters.subjectId, subjectId),
  });
  const ratersById = new Map(subjectRaters.map((r) => [r.id, r]));
  const rIds = subjectRaters.map((r) => r.id);

  // answers — DB 側で raterId を絞る
  const subjectAns = rIds.length
    ? await db.query.answers.findMany({
        where: inArray(answers.raterId, rIds),
      })
    : [];

  // 集計
  type Acc = { sum: number; count: number };
  function emptyAcc(): Acc {
    return { sum: 0, count: 0 };
  }
  const selfByCat = new Map<number, Acc>();
  const othersByCat = new Map<number, Acc>();
  const othersRatersByCat = new Map<number, Set<number>>();

  for (const a of subjectAns) {
    if (a.scaleValue == null) continue;
    const q = qInThisSet.find((qq) => qq.id === a.questionId);
    if (!q) continue;
    const rater = ratersById.get(a.raterId);
    if (!rater) continue;
    if (rater.status !== "submitted") continue;

    const bucket = rater.relation === "self" ? selfByCat : othersByCat;
    const acc = bucket.get(q.categoryId) ?? emptyAcc();
    acc.sum += a.scaleValue;
    acc.count += 1;
    bucket.set(q.categoryId, acc);

    if (rater.relation !== "self") {
      const s = othersRatersByCat.get(q.categoryId) ?? new Set<number>();
      s.add(rater.id);
      othersRatersByCat.set(q.categoryId, s);
    }
  }

  const selfValues: (number | null)[] = cats.map((c) => {
    const a = selfByCat.get(c.id);
    return a && a.count > 0 ? Number((a.sum / a.count).toFixed(2)) : null;
  });
  const othersValues: (number | null)[] = cats.map((c) => {
    const a = othersByCat.get(c.id);
    const distinctRaters = (othersRatersByCat.get(c.id) ?? new Set()).size;
    if (!a || a.count === 0) return null;
    if (distinctRaters < N_MIN) return null;
    return Number((a.sum / a.count).toFixed(2));
  });

  const otherRatersCount = subjectRaters.filter(
    (r) => r.relation !== "self" && r.status === "submitted",
  ).length;

  const series: RadarSeries[] = [
    {
      label: "自己評価",
      values: selfValues,
      color: "var(--color-info)",
      fillOpacity: 0.12,
    },
    {
      label: `他者平均 (n=${otherRatersCount})`,
      values: othersValues,
      color: "var(--color-text)",
      fillOpacity: 0.18,
    },
  ];

  // コメント抜粋 (free_text) — rater 情報付きで保持
  type CommentRow = {
    id: number;
    raterId: number;
    relation: string;
    text: string;
    qBody: string;
  };
  const comments: CommentRow[] = subjectAns
    .filter((a) => a.textValue && a.textValue.trim().length > 0)
    .filter((a) => freeQs.some((q) => q.id === a.questionId))
    .filter((a) => {
      const r = ratersById.get(a.raterId);
      return r && r.status === "submitted" && r.relation !== "self";
    })
    .map((a) => {
      const r = ratersById.get(a.raterId)!;
      const q = freeQs.find((qq) => qq.id === a.questionId)!;
      return {
        id: a.id,
        raterId: r.id,
        relation: r.relation,
        text: a.textValue!,
        qBody: q.body,
      };
    });

  // 匿名性: relation ごとの DISTINCT rater 数で n を測る
  // （複数の自由記述設問に同一 rater が書くと、件数ベースだと膨らんで n<3 をすり抜けるため）
  const ratersByRelation = new Map<string, Set<number>>();
  for (const c of comments) {
    const s = ratersByRelation.get(c.relation) ?? new Set<number>();
    s.add(c.raterId);
    ratersByRelation.set(c.relation, s);
  }

  return (
    <main style={pageStyle}>
      <p className="t-small" style={{ color: "var(--color-text-muted)", marginBottom: 8 }}>
        <Link
          href="/me"
          style={{ color: "var(--color-text-muted)", textDecoration: "none" }}
        >
          ← マイページ
        </Link>
      </p>

      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          {project.name}
        </p>
        <h1 className="t-h1">{subjectUser.displayName ?? subjectUser.email} さんの 360 結果</h1>
        <p className="t-small" style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
          {subject.departmentSnapshot ?? "—"} ・ {subject.positionSnapshot ?? "—"}
        </p>
        {project.status !== "closed" ? (
          <p
            className="t-small card-nested"
            style={{
              background: "var(--color-surface-2)",
              color: "var(--color-warning)",
              marginTop: 12,
              padding: "8px 12px",
            }}
          >
            ※ プロジェクトはまだ「{statusLabel(project.status)}」です。締切後に確定値が出ます。
          </p>
        ) : null}
      </header>

      {/* レーダー */}
      <section className="card" style={{ marginBottom: 24 }}>
        <h2 className="t-h3" style={{ marginBottom: 8 }}>
          カテゴリ別スコア
        </h2>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 320px", maxWidth: 420 }}>
            <RadarChart axes={cats.map((c) => c.name)} series={series} max={5} />
          </div>
          <div style={{ flex: "1 1 240px" }}>
            <Legend series={series} />
            <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>カテゴリ</th>
                  <th style={th}>自己</th>
                  <th style={th}>他者</th>
                  <th style={th}>差</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c, i) => {
                  const s = selfValues[i];
                  const o = othersValues[i];
                  const diff = s != null && o != null ? +(s - o).toFixed(2) : null;
                  return (
                    <tr key={c.id}>
                      <td style={td}>{c.name}</td>
                      <td style={td}>{s ?? "—"}</td>
                      <td style={td}>{o ?? `n<${N_MIN}`}</td>
                      <td
                        style={{
                          ...td,
                          color:
                            diff == null
                              ? undefined
                              : diff > 0.5
                              ? "var(--color-warning)"
                              : diff < -0.5
                              ? "var(--color-info)"
                              : undefined,
                        }}
                      >
                        {diff == null ? "—" : (diff > 0 ? "+" : "") + diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* コメント */}
      <section style={{ marginBottom: 24 }}>
        <h2 className="t-h3" style={{ marginBottom: 12 }}>
          他者からのコメント
        </h2>
        {comments.length === 0 ? (
          <div className="card">
            <p className="t-body" style={{ color: "var(--color-text-muted)" }}>
              まだコメントが集まっていません。
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {comments.map((c) => {
              const distinctRaters = ratersByRelation.get(c.relation)?.size ?? 0;
              const showRelation =
                distinctRaters >= N_MIN
                  ? relationLabel(c.relation)
                  : "匿名（少数のため関係も伏せています）";
              return (
                <div key={c.id} className="card">
                  <p className="eyebrow" style={{ marginBottom: 6 }}>
                    {showRelation}
                  </p>
                  <p className="t-body" style={{ marginBottom: 6 }}>
                    {c.text}
                  </p>
                  <p
                    className="t-caption"
                    style={{ color: "var(--color-text-light)" }}
                  >
                    設問: {c.qBody}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <footer>
        <p
          className="t-caption"
          style={{ color: "var(--color-text-light)", textAlign: "center" }}
        >
          匿名性ルール: 各カテゴリ・関係内で n &lt; {N_MIN}（distinct rater 数）のときは平均値・関係名をマスクします。
        </p>
      </footer>
    </main>
  );
}

function Legend({ series }: { series: RadarSeries[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {series.map((s) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              background: s.color,
              borderRadius: 4,
            }}
          />
          <span className="t-small">{s.label}</span>
        </div>
      ))}
    </div>
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
    case "boss": return "上司";
    case "peer": return "同僚";
    case "subordinate": return "部下";
    default: return r;
  }
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 4px",
  borderBottom: "1px solid var(--color-border)",
  fontWeight: 600,
  fontSize: "0.786rem",
  color: "var(--color-text-muted)",
};

const td: React.CSSProperties = {
  padding: "8px 4px",
  fontSize: "0.875rem",
  borderBottom: "1px dashed var(--color-surface-2)",
};

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: "48px 24px",
  maxWidth: 960,
  margin: "0 auto",
};
