import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  primaryKey,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ────────────────────────────────────────
 * 1. ユーザーマスタ
 *    NextAuth Drizzle Adapter 互換のため users.id は text (uuid)
 * ──────────────────────────────────────── */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  name: text("name"),
  displayName: text("display_name"),
  position: text("position"),
  department: text("department"),
  image: text("image"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ────────────────────────────────────────
 * 2. 設問テンプレート（question_sets > categories > questions）
 *    プロジェクト横断で再利用、複数版あり
 * ──────────────────────────────────────── */

export const questionSets = pgTable("question_sets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull().default("1"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    questionSetId: integer("question_set_id")
      .notNull()
      .references(() => questionSets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
  },
  (t) => ({
    qsetOrder: index("categories_qset_order_idx").on(t.questionSetId, t.orderIndex),
  }),
);

export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    responseType: text("response_type").notNull().default("scale"), // scale | free_text
    scaleMin: integer("scale_min").notNull().default(1),
    scaleMax: integer("scale_max").notNull().default(5),
    orderIndex: integer("order_index").notNull().default(0),
    required: boolean("required").notNull().default(true),
  },
  (t) => ({
    catOrder: index("questions_cat_order_idx").on(t.categoryId, t.orderIndex),
  }),
);

/* ────────────────────────────────────────
 * 3. プロジェクト = 1 サイクル
 * ──────────────────────────────────────── */

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("draft"), // draft|open|closed|archived
  questionSetId: integer("question_set_id").references(() => questionSets.id, {
    onDelete: "set null",
  }),
  opensAt: timestamp("opens_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  createdByUserId: text("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ────────────────────────────────────────
 * 4. 被評価者 (subjects) と 評価者 (raters)
 * ──────────────────────────────────────── */

export const subjects = pgTable(
  "subjects",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    positionSnapshot: text("position_snapshot"),
    departmentSnapshot: text("department_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectUserUnique: uniqueIndex("subjects_project_user_unique").on(
      t.projectId,
      t.userId,
    ),
  }),
);

export const raters = pgTable(
  "raters",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(), // self | boss | peer | subordinate | other
    status: text("status").notNull().default("invited"), // invited | in_progress | submitted
    token: text("token").notNull().unique(),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => ({
    subjectUserUnique: uniqueIndex("raters_subject_user_unique").on(
      t.subjectId,
      t.userId,
    ),
  }),
);

/* ────────────────────────────────────────
 * 5. 回答
 * ──────────────────────────────────────── */

export const answers = pgTable(
  "answers",
  {
    id: serial("id").primaryKey(),
    raterId: integer("rater_id")
      .notNull()
      .references(() => raters.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    scaleValue: integer("scale_value"),
    textValue: text("text_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    raterQuestionUnique: uniqueIndex("answers_rater_question_unique").on(
      t.raterId,
      t.questionId,
    ),
  }),
);

/* ────────────────────────────────────────
 * 6. NextAuth (Auth.js v5) Drizzle Adapter のスキーマ
 *    現在は使っていないが将来の戻し戻しのため残置
 * ──────────────────────────────────────── */

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

/* ────────────────────────────────────────
 * 7. 型エクスポート
 * ──────────────────────────────────────── */

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Rater = typeof raters.$inferSelect;
export type QuestionSet = typeof questionSets.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Answer = typeof answers.$inferSelect;
