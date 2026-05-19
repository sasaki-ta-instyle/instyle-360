/**
 * idempotent seed.
 * Phase 0/1 のテストモード用にサンプルデータを投入する。
 * 既存レコードがあればスキップ。
 *
 * build script から呼ばれる: `tsx db/migrate.ts && tsx db/seed.ts && next build`
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";

const TEST_USERS = [
  { id: "test-admin-sasaki", email: "sasaki@instyle.group",   displayName: "佐々木 武",       position: "代表",         department: "経営",     isAdmin: true  },
  { id: "test-user-tanabe",  email: "tanabe@instyle.group",   displayName: "田邉 一郎",       position: "マネージャー", department: "営業",     isAdmin: false },
  { id: "test-user-yamada",  email: "yamada@instyle.group",   displayName: "山田 太郎",       position: "リーダー",     department: "営業",     isAdmin: false },
  { id: "test-user-nakano",  email: "nakano@instyle.group",   displayName: "中野 花子",       position: "マネージャー", department: "クリエイティブ", isAdmin: false },
  { id: "test-user-kashiwagi", email: "kashiwagi@instyle.group", displayName: "柏木 健太",   position: "メンバー",     department: "クリエイティブ", isAdmin: false },
  { id: "test-user-wada",    email: "wada@instyle.group",     displayName: "和田 美咲",       position: "メンバー",     department: "営業",     isAdmin: false },
  { id: "test-user-furuya",  email: "furuya@instyle.group",   displayName: "古谷 直樹",       position: "リーダー",     department: "コーポレート",  isAdmin: false },
];

const QSET_NAME = "instyle 360 標準テンプレ v1";

const CATEGORIES: { name: string; description: string; questions: { body: string; type?: "scale" | "free_text" }[] }[] = [
  {
    name: "リーダーシップ",
    description: "メンバーを巻き込んで成果を出す力",
    questions: [
      { body: "明確なビジョンや目標を示している" },
      { body: "難しい局面で意思決定を引き受けている" },
      { body: "メンバーが意見を出しやすい場をつくっている" },
      { body: "失敗を許容し、学びに変える姿勢がある" },
    ],
  },
  {
    name: "チームワーク",
    description: "他者と協働する姿勢",
    questions: [
      { body: "他部署を含めた連携を能動的にとっている" },
      { body: "メンバーの強みを理解し役割を任せている" },
      { body: "対立を健全な議論に変えている" },
      { body: "もっと伸ばしてほしい行動・改善点を自由に記述してください", type: "free_text" },
    ],
  },
  {
    name: "専門スキル",
    description: "担当領域での実行力・専門性",
    questions: [
      { body: "担当領域の知識・スキルが信頼に足る水準にある" },
      { body: "業務品質に対するこだわりが高い" },
      { body: "成果につながる優先順位づけができている" },
      { body: "特に強みだと感じる行動・場面を自由に記述してください", type: "free_text" },
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

  // 2) question set + categories + questions
  let qset = await db.query.questionSets.findFirst({ where: eq(schema.questionSets.name, QSET_NAME) });
  if (!qset) {
    const inserted = await db.insert(schema.questionSets).values({ name: QSET_NAME, isDefault: true }).returning();
    qset = inserted[0];
    console.log(`seed:   question_set "${QSET_NAME}" created (id=${qset.id})`);

    for (const [ci, cat] of CATEGORIES.entries()) {
      const [createdCat] = await db
        .insert(schema.categories)
        .values({ questionSetId: qset.id, name: cat.name, description: cat.description, orderIndex: ci })
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
    console.log(`seed:   categories + questions inserted`);
  } else {
    console.log(`seed:   question_set "${QSET_NAME}" already exists (id=${qset.id})`);
  }

  // 3) sample project
  const projectName = "2026 上期 360 評価（テスト）";
  let project = await db.query.projects.findFirst({ where: eq(schema.projects.name, projectName) });
  if (!project) {
    const opensAt = new Date();
    const closesAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14); // +14 days
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
  } else {
    console.log(`seed:   project "${projectName}" already exists (id=${project.id})`);
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

  // 5) sample answers — submitted な rater × scale 質問 にダミーのスコアを入れる
  const submittedRaters = await db.query.raters.findMany({
    where: eq(schema.raters.status, "submitted"),
  });
  const scaleQuestions = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.responseType, "scale"));
  const freeTextQuestions = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.responseType, "free_text"));

  let insertedAnswers = 0;
  for (const r of submittedRaters) {
    for (const q of scaleQuestions) {
      const exists = await db.query.answers.findFirst({
        where: and(eq(schema.answers.raterId, r.id), eq(schema.answers.questionId, q.id)),
      });
      if (exists) continue;
      // relation で軽くバイアスを付ける
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
