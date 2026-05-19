import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/test-mode";
import { db } from "@/db/client";
import { projects, subjects, raters, users } from "@/db/schema";
import { eq, and, notInArray, inArray } from "drizzle-orm";
import {
  sendInvitation,
  sendReminder,
  sendClosingNotice,
  getEmailMode,
} from "@/lib/mail/notifications";

export const dynamic = "force-dynamic";

function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type Relation = "self" | "boss" | "peer" | "subordinate" | "other";
type ProjectStatus = "draft" | "open" | "closed" | "archived";

function parseRelation(v: unknown): Relation {
  const s = String(v ?? "");
  if (s === "self" || s === "boss" || s === "peer" || s === "subordinate" || s === "other") {
    return s;
  }
  return "peer";
}

function parseProjectStatus(v: unknown): ProjectStatus | null {
  const s = String(v ?? "");
  if (s === "draft" || s === "open" || s === "closed" || s === "archived") return s;
  return null;
}

type SearchParams = Promise<{
  msg?: string;
  count?: string;
}>;

export default async function AdminProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) redirect("/me");

  const { id: idParam } = await params;
  const sp = await searchParams;
  const projectId = Number(idParam);
  if (!Number.isFinite(projectId)) notFound();

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) notFound();

  // 被評価者
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

  // 各 subject の raters
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
      .innerJoin(users, eq(raters.userId, users.id))
      .where(inArray(raters.subjectId, subjectIds));
    for (const r of fullList) {
      const list = ratersBySubject.get(r.subjectId) ?? [];
      list.push(r);
      ratersBySubject.set(r.subjectId, list);
    }
  }

  // 候補ユーザー（active のみ）
  const allActive = await db.query.users.findMany({
    where: eq(users.isActive, true),
  });
  const subjectUserIds = new Set(subjectRows.map((s) => s.userId));
  const subjectCandidates = allActive.filter((u) => !subjectUserIds.has(u.id));

  /* ────────────────────────────────────────
   * Server Actions
   * ──────────────────────────────────────── */

  async function addSubject(formData: FormData) {
    "use server";
    const pid = Number(formData.get("projectId"));
    const userId = String(formData.get("userId") ?? "");
    if (!pid || !userId) return;
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) return;
    await db
      .insert(subjects)
      .values({
        projectId: pid,
        userId,
        positionSnapshot: user.position,
        departmentSnapshot: user.department,
      })
      .onConflictDoNothing();
    // 自己評価 (self) の rater を自動で 1 件作る
    const newSubject = await db.query.subjects.findFirst({
      where: and(eq(subjects.projectId, pid), eq(subjects.userId, userId)),
    });
    if (newSubject) {
      await db
        .insert(raters)
        .values({
          subjectId: newSubject.id,
          userId,
          relation: "self",
          status: "invited",
          token: randomToken(),
        })
        .onConflictDoNothing();
    }
    revalidatePath(`/admin/projects/${pid}`);
    redirect(`/admin/projects/${pid}?msg=subject-added`);
  }

  async function removeSubject(formData: FormData) {
    "use server";
    const pid = Number(formData.get("projectId"));
    const sid = Number(formData.get("subjectId"));
    if (!pid || !sid) return;
    await db.delete(subjects).where(eq(subjects.id, sid));
    revalidatePath(`/admin/projects/${pid}`);
    redirect(`/admin/projects/${pid}?msg=subject-removed`);
  }

  async function addRater(formData: FormData) {
    "use server";
    const pid = Number(formData.get("projectId"));
    const sid = Number(formData.get("subjectId"));
    const userId = String(formData.get("userId") ?? "");
    const relation = parseRelation(formData.get("relation"));
    if (!pid || !sid || !userId) return;
    await db
      .insert(raters)
      .values({
        subjectId: sid,
        userId,
        relation,
        status: "invited",
        token: randomToken(),
      })
      .onConflictDoNothing();
    revalidatePath(`/admin/projects/${pid}`);
    redirect(`/admin/projects/${pid}?msg=rater-added`);
  }

  async function removeRater(formData: FormData) {
    "use server";
    const pid = Number(formData.get("projectId"));
    const rid = Number(formData.get("raterId"));
    if (!pid || !rid) return;
    await db.delete(raters).where(eq(raters.id, rid));
    revalidatePath(`/admin/projects/${pid}`);
    redirect(`/admin/projects/${pid}?msg=rater-removed`);
  }

  async function setStatus(formData: FormData) {
    "use server";
    const pid = Number(formData.get("projectId"));
    const next = parseProjectStatus(formData.get("status"));
    if (!pid || !next) return;

    const prj = await db.query.projects.findFirst({ where: eq(projects.id, pid) });
    if (!prj) return;

    // draft -> open: 招待メール
    let sent = 0;
    if (prj.status !== "open" && next === "open") {
      // 全 invited rater に invitation 送信
      const targets = await db
        .select({
          raterId: raters.id,
          token: raters.token,
          relation: raters.relation,
          email: users.email,
          subjectUserName: users.displayName,
          subjectId: subjects.id,
          subjectDisplay: users.displayName,
        })
        .from(raters)
        .innerJoin(subjects, eq(raters.subjectId, subjects.id))
        .innerJoin(users, eq(raters.userId, users.id))
        .where(and(eq(subjects.projectId, pid), eq(raters.status, "invited")));

      // subject display 名は subjects.userId 経由で別に引く
      const subjUsers = await db
        .select({ subjectId: subjects.id, displayName: users.displayName })
        .from(subjects)
        .innerJoin(users, eq(subjects.userId, users.id))
        .where(eq(subjects.projectId, pid));
      const subjNameById = new Map(subjUsers.map((s) => [s.subjectId, s.displayName ?? ""]));

      for (const t of targets) {
        await sendInvitation({
          to: t.email,
          subjectName: subjNameById.get(t.subjectId) ?? "",
          projectName: prj.name,
          raterToken: t.token,
          closesAt: prj.closesAt,
          relation: t.relation,
        });
        sent++;
      }
    }

    // open -> closed: 締切通知（被評価者へ）
    if (prj.status !== "closed" && next === "closed") {
      const subs = await db
        .select({ email: users.email, displayName: users.displayName })
        .from(subjects)
        .innerJoin(users, eq(subjects.userId, users.id))
        .where(eq(subjects.projectId, pid));
      for (const s of subs) {
        await sendClosingNotice({
          to: s.email,
          subjectName: s.displayName ?? "",
          projectName: prj.name,
        });
        sent++;
      }
    }

    await db.update(projects).set({ status: next }).where(eq(projects.id, pid));
    revalidatePath(`/admin/projects/${pid}`);
    redirect(
      `/admin/projects/${pid}?msg=status-changed&count=${sent}`,
    );
  }

  async function sendReminders(formData: FormData) {
    "use server";
    const pid = Number(formData.get("projectId"));
    if (!pid) return;
    const prj = await db.query.projects.findFirst({ where: eq(projects.id, pid) });
    if (!prj) return;
    const targets = await db
      .select({
        raterId: raters.id,
        token: raters.token,
        relation: raters.relation,
        email: users.email,
        subjectId: subjects.id,
      })
      .from(raters)
      .innerJoin(subjects, eq(raters.subjectId, subjects.id))
      .innerJoin(users, eq(raters.userId, users.id))
      .where(
        and(
          eq(subjects.projectId, pid),
          notInArray(raters.status, ["submitted"]),
        ),
      );
    const subjUsers = await db
      .select({ subjectId: subjects.id, displayName: users.displayName })
      .from(subjects)
      .innerJoin(users, eq(subjects.userId, users.id))
      .where(eq(subjects.projectId, pid));
    const subjNameById = new Map(subjUsers.map((s) => [s.subjectId, s.displayName ?? ""]));

    let sent = 0;
    for (const t of targets) {
      await sendReminder({
        to: t.email,
        subjectName: subjNameById.get(t.subjectId) ?? "",
        projectName: prj.name,
        raterToken: t.token,
        closesAt: prj.closesAt,
      });
      sent++;
    }
    revalidatePath(`/admin/projects/${pid}`);
    redirect(`/admin/projects/${pid}?msg=reminders-sent&count=${sent}`);
  }

  /* ────────────────────────────────────────
   * View
   * ──────────────────────────────────────── */

  const emailMode = getEmailMode();
  const banner = bannerFor(sp.msg, sp.count, emailMode);

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
        <Link
          href="/admin/projects"
          style={{ color: "var(--color-text-muted)", textDecoration: "none" }}
        >
          ← プロジェクト一覧
        </Link>
      </p>

      {banner ? (
        <div
          className="card-nested"
          style={{
            marginBottom: 16,
            background: "var(--color-surface-2)",
            padding: "12px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <p className="t-small" style={{ color: banner.color }}>
            {banner.text}
          </p>
          <Link
            href={`/admin/projects/${projectId}`}
            className="t-caption"
            style={{ color: "var(--color-text-muted)", textDecoration: "none" }}
          >
            閉じる
          </Link>
        </div>
      ) : null}

      {/* Header: name + status pill + actions */}
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

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 16,
            alignItems: "center",
          }}
        >
          {project.status === "draft" ? (
            <form action={setStatus}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="status" value="open" />
              <button type="submit" className="btn btn-primary">
                回答受付を開始する
              </button>
            </form>
          ) : null}
          {project.status === "open" ? (
            <>
              <form action={sendReminders}>
                <input type="hidden" name="projectId" value={projectId} />
                <button type="submit" className="btn btn-secondary">
                  未提出にリマインダー送信
                </button>
              </form>
              <form action={setStatus}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="status" value="closed" />
                <button type="submit" className="btn btn-primary">
                  回答受付を締め切る
                </button>
              </form>
            </>
          ) : null}
          {project.status === "closed" ? (
            <>
              <form action={setStatus}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="status" value="open" />
                <button type="submit" className="btn btn-secondary">
                  受付に戻す
                </button>
              </form>
              <form action={setStatus}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="status" value="archived" />
                <button type="submit" className="btn btn-secondary">
                  アーカイブする
                </button>
              </form>
            </>
          ) : null}
          {project.status === "archived" ? (
            <form action={setStatus}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="status" value="draft" />
              <button type="submit" className="btn btn-secondary">
                下書きに戻す
              </button>
            </form>
          ) : null}

          <span
            className="t-caption"
            style={{
              color: "var(--color-text-muted)",
              marginLeft: 8,
            }}
          >
            メール: {emailMode === "send" ? "実送信" : "ログのみ（テストモード）"}
          </span>
        </div>
      </header>

      {/* 被評価者と評価者 */}
      <section style={{ marginBottom: 24 }}>
        <h2 className="t-h3" style={{ marginBottom: 12 }}>
          被評価者と評価者
        </h2>

        {subjectRows.length === 0 ? (
          <div className="card" style={{ marginBottom: 12 }}>
            <p className="t-body" style={{ color: "var(--color-text-muted)" }}>
              まだ被評価者が割り当てられていません。
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {subjectRows.map((s) => {
              const rs = ratersBySubject.get(s.subjectId) ?? [];
              const submitted = rs.filter((r) => r.status === "submitted").length;
              const subjectRaterUserIds = new Set(rs.map((r) => r.userId));
              const raterCandidates = allActive.filter(
                (u) => !subjectRaterUserIds.has(u.id),
              );
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
                      <p
                        className="t-small"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {s.department ?? "—"} ・ {s.position ?? "—"}
                      </p>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "baseline",
                      }}
                    >
                      <p
                        className="t-small"
                        style={{
                          color: "var(--color-text-muted)",
                          marginRight: 8,
                        }}
                      >
                        提出 {submitted} / {rs.length}
                      </p>
                      <Link
                        href={`/results/${s.subjectId}`}
                        className="btn btn-secondary"
                      >
                        結果
                      </Link>
                      <form action={removeSubject}>
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="subjectId" value={s.subjectId} />
                        <button
                          type="submit"
                          className="btn btn-secondary"
                          style={{ color: "var(--color-error)" }}
                          formNoValidate
                        >
                          削除
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* rater chips */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    {rs.map((r) => (
                      <span
                        key={r.id}
                        className="t-small card-nested"
                        style={{
                          padding: "4px 4px 4px 12px",
                          margin: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {relationLabel(r.relation)} ・ {r.displayName ?? r.userId}
                        <StatusDot status={r.status} />
                        <form action={removeRater} style={{ display: "inline" }}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="raterId" value={r.id} />
                          <button
                            type="submit"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--color-text-muted)",
                              cursor: "pointer",
                              padding: "0 4px",
                              fontSize: "0.875rem",
                            }}
                            title="削除"
                          >
                            ✕
                          </button>
                        </form>
                      </span>
                    ))}
                    {rs.length === 0 ? (
                      <span
                        className="t-small"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        評価者未割当
                      </span>
                    ) : null}
                  </div>

                  {/* + 評価者を追加 */}
                  {raterCandidates.length > 0 ? (
                    <form
                      action={addRater}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        type="hidden"
                        name="projectId"
                        value={projectId}
                      />
                      <input
                        type="hidden"
                        name="subjectId"
                        value={s.subjectId}
                      />
                      <select
                        className="input"
                        name="userId"
                        required
                        style={{
                          flex: "1 1 200px",
                          padding: "8px 12px",
                          fontSize: "0.875rem",
                        }}
                      >
                        {raterCandidates.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName ?? u.email}
                          </option>
                        ))}
                      </select>
                      <select
                        className="input"
                        name="relation"
                        defaultValue="peer"
                        style={{
                          flex: "0 0 140px",
                          padding: "8px 12px",
                          fontSize: "0.875rem",
                        }}
                      >
                        <option value="boss">上司</option>
                        <option value="peer">同僚</option>
                        <option value="subordinate">部下</option>
                        <option value="other">その他</option>
                      </select>
                      <button
                        type="submit"
                        className="btn btn-secondary"
                        style={{ padding: "8px 16px", fontSize: "0.875rem" }}
                      >
                        ＋ 評価者を追加
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {/* + 被評価者を追加 */}
        {subjectCandidates.length > 0 ? (
          <form
            action={addSubject}
            style={{
              marginTop: 16,
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              padding: 16,
              background: "var(--color-surface-2)",
              borderRadius: "var(--r)",
            }}
          >
            <input type="hidden" name="projectId" value={projectId} />
            <span
              className="t-small"
              style={{ color: "var(--color-text-muted)", flex: "0 0 auto" }}
            >
              被評価者を追加:
            </span>
            <select
              className="input"
              name="userId"
              required
              style={{
                flex: "1 1 240px",
                padding: "8px 12px",
                fontSize: "0.875rem",
              }}
            >
              {subjectCandidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName ?? u.email} {u.isAdmin ? "(admin)" : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">
              ＋ 追加
            </button>
            <p
              className="t-caption"
              style={{
                color: "var(--color-text-muted)",
                width: "100%",
                marginTop: 4,
              }}
            >
              追加すると自動的に「自己評価」の rater が 1 件作られます。
            </p>
          </form>
        ) : (
          <p
            className="t-caption"
            style={{
              marginTop: 12,
              color: "var(--color-text-muted)",
              textAlign: "center",
            }}
          >
            利用可能なユーザーは全員このプロジェクトに割り当て済みです。
          </p>
        )}
      </section>
    </main>
  );
}

function bannerFor(
  msg: string | undefined,
  count: string | undefined,
  emailMode: "send" | "log",
): { text: string; color: string } | null {
  if (!msg) return null;
  const n = count ?? "0";
  const modeNote = emailMode === "send" ? "（実送信しました）" : "（テストモードのためログ出力のみ）";
  switch (msg) {
    case "subject-added": return { text: "被評価者を追加しました。", color: "var(--color-success)" };
    case "subject-removed": return { text: "被評価者を削除しました。", color: "var(--color-text-muted)" };
    case "rater-added": return { text: "評価者を追加しました。", color: "var(--color-success)" };
    case "rater-removed": return { text: "評価者を削除しました。", color: "var(--color-text-muted)" };
    case "status-changed": return { text: `ステータスを変更しました。${n !== "0" ? `${n} 通のメール送信を実行${modeNote}` : ""}`, color: "var(--color-success)" };
    case "reminders-sent": return { text: `${n} 件のリマインダーを送信${modeNote}`, color: "var(--color-success)" };
    default: return null;
  }
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
    case "other": return "その他";
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
        verticalAlign: "middle",
      }}
    />
  );
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
