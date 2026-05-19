/**
 * idempotent seed.
 * Phase 1 のテストモード用にサンプルデータを投入する。
 * 既存レコードがあればスキップ。
 *
 * build script から呼ばれる: `tsx db/migrate.ts && tsx db/seed.ts && next build`
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, ne } from "drizzle-orm";
import * as schema from "./schema";

const TEST_USERS = [
  { id: "test-admin-sasaki", email: "sasaki@instyle.group",   displayName: "佐々木 武",       position: "代表",         department: "経営",          isAdmin: true  },
  { id: "test-user-tanabe",  email: "tanabe@instyle.group",   displayName: "田邉 一郎",       position: "マネージャー", department: "営業",          isAdmin: false },
  { id: "test-user-yamada",  email: "yamada@instyle.group",   displayName: "山田 太郎",       position: "リーダー",     department: "営業",          isAdmin: false },
  { id: "test-user-nakano",  email: "nakano@instyle.group",   displayName: "中野 花子",       position: "マネージャー", department: "クリエイティブ", isAdmin: false },
  { id: "test-user-kashiwagi", email: "kashiwagi@instyle.group", displayName: "柏木 健太",   position: "メンバー",     department: "クリエイティブ", isAdmin: false },
  { id: "test-user-wada",    email: "wada@instyle.group",     displayName: "和田 美咲",       position: "メンバー",     department: "営業",          isAdmin: false },
  { id: "test-user-furuya",  email: "furuya@instyle.group",   displayName: "古谷 直樹",       position: "リーダー",     department: "コーポレート",  isAdmin: false },
];

/* ────────────────────────────────────────
 * instyle 11 Philosophy 評価テンプレ
 * 原典: Google スプレッドシート
 *   https://docs.google.com/spreadsheets/d/1GZ9w8Rw_gxtEcS5XdxLa14O1f6W62gIm/edit?gid=1209144772
 * - name = サブカテゴリ名（レーダー軸ラベル）
 * - description = フィロソフィー（11 Philosophy のどれか）
 * ──────────────────────────────────────── */
const QSET_NAME = "instyle 11 Philosophy v1";

const CATEGORIES_11P: {
  name: string;
  description: string;
  questions: { body: string; type?: "scale" | "free_text" }[];
}[] = [
  {
    name: "自律・主体性",
    description: "Philosophy 1. 自由",
    questions: [
      { body: "言われたことだけでなく、自分から考えて動いている" },
      { body: "ルールや仕組みの「意図」を理解した上で行動している" },
      { body: "誰かに見られていなくても、同じ姿勢・同じ質で働いている" },
    ],
  },
  {
    name: "コスト・投資意識",
    description: "Philosophy 2. お金",
    questions: [
      { body: "会社やチームのお金（コスト・利益）を自分ごととして考えている" },
      { body: "「いい仕事をしてから、いい報酬」という順番で考えている" },
    ],
  },
  {
    name: "自責・成長",
    description: "Philosophy 3. 成長",
    questions: [
      { body: "問題が起きたとき、まず「自分に何ができたか」を考えている" },
      { body: "失敗や指摘を素直に受け取り、次の行動に活かしている" },
      { body: "自分のスキルや知識を能動的にアップデートしようとしている" },
      { body: "結果や評価について、環境や他者のせいにせず説明できる" },
    ],
  },
  {
    name: "人間関係・チームワーク",
    description: "Philosophy 4. 人間関係",
    questions: [
      { body: "その場にいない人の悪口・陰口を言わない" },
      { body: "自分の担当範囲を超えて、チームのことを自分ごととして動いている" },
      { body: "チームメンバーに対して、巻き込みながら物事を進めている" },
      { body: "困ったときに適切なタイミングで周囲にサポートを求められる" },
    ],
  },
  {
    name: "仕事の質・意味",
    description: "Philosophy 5. プロフェッショナル",
    questions: [
      { body: "与えられたタスクをこなすだけでなく、目的・意図を理解して動いている" },
      { body: "自分の仕事がチームや会社全体にどうつながるかを説明できる" },
      { body: "優先順位を自分で判断し、重要なことから取り組んでいる" },
      { body: "結果（アウトカム）に対して責任を持って取り組んでいる" },
    ],
  },
  {
    name: "報告・情報共有",
    description: "Philosophy 6. コミュニケーション",
    questions: [
      { body: "悪いことも含め、事実を早く・正確に共有している" },
      { body: "報告・連絡・相談のタイミングと粒度が適切で、周囲の手戻りを減らしている" },
      { body: "自分のアピールのためでなく、チームや相手のために情報を共有している" },
      { body: "事実と意見（感情）を区別してコミュニケーションしている" },
    ],
  },
  {
    name: "時間・生産性",
    description: "Philosophy 7. 時間",
    questions: [
      { body: "時間を価値あるものとして扱い、無駄を減らそうとしている" },
      { body: "自分・他者の時間を奪わないよう工夫している（会議・返信・待ち時間など）" },
      { body: "作業の効率化・仕組み化を考え、生産性を上げようとしている" },
    ],
  },
  {
    name: "信頼・誠実さ",
    description: "Philosophy 8. 信頼",
    questions: [
      { body: "小さな約束（締め切り・返事・報告など）を守っている" },
      { body: "言っていることと、やっていることが一致している" },
      { body: "チームメンバーに権限や仕事を任せ、自分でやりすぎず信頼して委ねている" },
    ],
  },
  {
    name: "行動力・実行力",
    description: "Philosophy 9. 行動",
    questions: [
      { body: "考えすぎて動きが止まるより、まず動いて修正するスタイルで仕事をしている" },
      { body: "失敗を恐れず、新しいことや難易度の高いことに挑戦している" },
      { body: "行動量が多く、アウトプットの数・頻度が高い" },
    ],
  },
  {
    name: "多様性・一体感",
    description: "Philosophy 10. 多様性",
    questions: [
      { body: "多様な意見・背景・スタイルを持つ人と協力できている" },
      { body: "忌憚なく意見を言い、また人の意見を対等に聞くことができている" },
      { body: "文句や批判より、「自分がどうするか」を先に考えて行動している" },
    ],
  },
  {
    name: "自由記述",
    description: "コメント（任意）",
    questions: [
      { body: "この人が「もっとこうすれば伸びる」と思うことを、具体的に教えてください。", type: "free_text" },
      { body: "この人の「一番いいところ」を一言で表してください。", type: "free_text" },
    ],
  },
];

function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("seed: DATABASE_URL is not set; skipping.");
    return;
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  const db = drizzle(pool, { schema });

  console.log("seed: starting…");

  // 1) users
  for (const u of TEST_USERS) {
    await db
      .insert(schema.users)
      .values({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        name: u.displayName,
        position: u.position,
        department: u.department,
        isAdmin: u.isAdmin,
        isActive: true,
      })
      .onConflictDoNothing();
  }
  console.log(`seed:   users → ${TEST_USERS.length} ensured`);

  // 2) ensure 11-philosophy question set + categories + questions
  let qset = await db.query.questionSets.findFirst({
    where: eq(schema.questionSets.name, QSET_NAME),
  });
  if (!qset) {
    const inserted = await db
      .insert(schema.questionSets)
      .values({ name: QSET_NAME, isDefault: true })
      .returning();
    qset = inserted[0];
    console.log(`seed:   question_set "${QSET_NAME}" created (id=${qset.id})`);

    for (const [ci, cat] of CATEGORIES_11P.entries()) {
      const [createdCat] = await db
        .insert(schema.categories)
        .values({
          questionSetId: qset.id,
          name: cat.name,
          description: cat.description,
          orderIndex: ci,
        })
        .returning();
      for (const [qi, q] of cat.questions.entries()) {
        await db.insert(schema.questions).values({
          categoryId: createdCat.id,
          body: q.body,
          responseType: q.type ?? "scale",
          scaleMin: 1,
          scaleMax: 5,
          orderIndex: qi,
          required: q.type !== "free_text",
        });
      }
    }
    console.log(`seed:   categories + questions inserted (${CATEGORIES_11P.length} categories)`);
  } else {
    console.log(`seed:   question_set "${QSET_NAME}" already exists (id=${qset.id})`);
    // ensure default flag
    if (!qset.isDefault) {
      await db
        .update(schema.questionSets)
        .set({ isDefault: true })
        .where(eq(schema.questionSets.id, qset.id));
    }
  }

  // 2b) demote any other question sets from default
  await db
    .update(schema.questionSets)
    .set({ isDefault: false })
    .where(and(eq(schema.questionSets.isDefault, true), ne(schema.questionSets.id, qset.id)));

  // 3) sample project (idempotent by name)
  const projectName = "2026 上期 360 評価（テスト）";
  let project = await db.query.projects.findFirst({
    where: eq(schema.projects.name, projectName),
  });
  if (!project) {
    const opensAt = new Date();
    const closesAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
    const inserted = await db
      .insert(schema.projects)
      .values({
        name: projectName,
        description: "Phase 1 のテスト用サンプルプロジェクト。本番運用前にアーカイブ予定。",
        status: "open",
        questionSetId: qset.id,
        createdByUserId: "test-admin-sasaki",
        opensAt,
        closesAt,
      })
      .returning();
    project = inserted[0];
    console.log(`seed:   project "${projectName}" created (id=${project.id})`);
  } else if (project.questionSetId !== qset.id) {
    // 既存プロジェクトのテンプレを 11 Philosophy に差し替える
    await db
      .update(schema.projects)
      .set({ questionSetId: qset.id })
      .where(eq(schema.projects.id, project.id));
    console.log(`seed:   project "${projectName}" switched to new qset`);
  } else {
    console.log(`seed:   project "${projectName}" already exists & up to date (id=${project.id})`);
  }

  // 4) subjects + raters
  const subjectSpecs: {
    userId: string;
    raters: { userId: string; relation: "self" | "boss" | "peer" | "subordinate"; status?: "invited" | "in_progress" | "submitted" }[];
  }[] = [
    {
      userId: "test-user-tanabe",
      raters: [
        { userId: "test-user-tanabe", relation: "self", status: "submitted" },
        { userId: "test-admin-sasaki", relation: "boss", status: "submitted" },
        { userId: "test-user-yamada", relation: "peer", status: "in_progress" },
        { userId: "test-user-nakano", relation: "peer", status: "submitted" },
        { userId: "test-user-kashiwagi", relation: "peer", status: "invited" },
        { userId: "test-user-wada", relation: "peer", status: "submitted" },
      ],
    },
    {
      userId: "test-user-nakano",
      raters: [
        { userId: "test-user-nakano", relation: "self", status: "submitted" },
        { userId: "test-admin-sasaki", relation: "boss", status: "invited" },
        { userId: "test-user-tanabe", relation: "peer", status: "submitted" },
        { userId: "test-user-yamada", relation: "peer", status: "in_progress" },
        { userId: "test-user-kashiwagi", relation: "subordinate", status: "submitted" },
      ],
    },
  ];

  for (const spec of subjectSpecs) {
    const subjectUser = TEST_USERS.find((u) => u.id === spec.userId)!;
    let subject = await db.query.subjects.findFirst({
      where: and(eq(schema.subjects.projectId, project.id), eq(schema.subjects.userId, spec.userId)),
    });
    if (!subject) {
      const inserted = await db
        .insert(schema.subjects)
        .values({
          projectId: project.id,
          userId: spec.userId,
          positionSnapshot: subjectUser.position,
          departmentSnapshot: subjectUser.department,
        })
        .returning();
      subject = inserted[0];
      console.log(`seed:   subject ${spec.userId} (${subjectUser.displayName}) created`);
    }

    for (const rspec of spec.raters) {
      const existing = await db.query.raters.findFirst({
        where: and(eq(schema.raters.subjectId, subject.id), eq(schema.raters.userId, rspec.userId)),
      });
      if (existing) continue;
      await db.insert(schema.raters).values({
        subjectId: subject.id,
        userId: rspec.userId,
        relation: rspec.relation,
        status: rspec.status ?? "invited",
        token: randomToken(),
        submittedAt: rspec.status === "submitted" ? new Date() : null,
      });
    }
  }

  // 5) sample answers — このプロジェクトの qset に紐づく質問だけ対象
  const subjectIdsInProject = await db
    .select({ id: schema.subjects.id })
    .from(schema.subjects)
    .where(eq(schema.subjects.projectId, project.id));
  const subjectIds = subjectIdsInProject.map((s) => s.id);

  const ratersInProject = await db.query.raters.findMany({});
  const submittedRaters = ratersInProject
    .filter((r) => subjectIds.includes(r.subjectId))
    .filter((r) => r.status === "submitted");

  // qset 経由で質問を取り出す
  const catsInSet = await db.query.categories.findMany({
    where: eq(schema.categories.questionSetId, qset.id),
  });
  const catIds = catsInSet.map((c) => c.id);
  const allQs = await db.query.questions.findMany({});
  const qsInSet = allQs.filter((q) => catIds.includes(q.categoryId));
  const scaleQuestions = qsInSet.filter((q) => q.responseType === "scale");
  const freeTextQuestions = qsInSet.filter((q) => q.responseType === "free_text");

  let insertedAnswers = 0;
  for (const r of submittedRaters) {
    for (const q of scaleQuestions) {
      const exists = await db.query.answers.findFirst({
        where: and(eq(schema.answers.raterId, r.id), eq(schema.answers.questionId, q.id)),
      });
      if (exists) continue;
      const base = r.relation === "self" ? 4 : r.relation === "boss" ? 3.6 : r.relation === "subordinate" ? 4.2 : 3.8;
      const value = Math.max(1, Math.min(5, Math.round(base + (Math.random() - 0.5) * 1.6)));
      await db.insert(schema.answers).values({
        raterId: r.id,
        questionId: q.id,
        scaleValue: value,
      });
      insertedAnswers++;
    }
    for (const q of freeTextQuestions) {
      const exists = await db.query.answers.findFirst({
        where: and(eq(schema.answers.raterId, r.id), eq(schema.answers.questionId, q.id)),
      });
      if (exists) continue;
      const samples = [
        "場づくりに長けていて、議論が滞ったときに自然にほぐしてくれる。",
        "他部署との橋渡しが丁寧で、こちらが動きやすい。",
        "判断のスピードと深さのバランスが良い。",
        "1on1 で出てきた話を、その後の業務設計にちゃんと反映してくれる。",
        "事実と感情を切り分けたコミュニケーションができる。",
        "難しい局面で逃げずに意思決定を引き受けてくれる。",
      ];
      await db.insert(schema.answers).values({
        raterId: r.id,
        questionId: q.id,
        textValue: samples[Math.floor(Math.random() * samples.length)],
      });
      insertedAnswers++;
    }
  }
  console.log(`seed:   answers → +${insertedAnswers} inserted`);

  await pool.end();
  console.log("seed: done.");
}

main().catch((err) => {
  console.error("seed: error", err);
  process.exit(1);
});
