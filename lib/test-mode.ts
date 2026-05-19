/**
 * テストモード用の「現在のユーザー」解決。
 *
 * 本番化（NextAuth に戻す）前は、`TEST_MODE === "1"` を Vercel env に必須にする。
 * - TEST_MODE が "1" のとき: cookie `mock_user_id` を見て該当ユーザーを返す。
 *   cookie が無ければ最初の管理者 (test-admin-sasaki) に自動フォールバック。
 * - TEST_MODE が "1" でないとき: 一切のフォールバックをせず null を返す。
 *   呼び出し側のページは「未ログイン」相当として redirect / not found を選ぶ。
 *
 * このゲートを入れる理由:
 *   テストモードコードが本番に紛れたとき、TEST_MODE 未設定なら誰でも管理者になれる
 *   挙動を防ぐ最後のフェンス。本番化時はファイル全体を NextAuth の auth() に
 *   差し替える前提だが、差し替え忘れの保険として残す。
 */
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { users, type User } from "@/db/schema";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "mock_user_id";
const FALLBACK_ADMIN_ID = "test-admin-sasaki";

export function isTestMode(): boolean {
  return process.env.TEST_MODE === "1";
}

export async function getCurrentUser(): Promise<User | null> {
  if (!isTestMode()) return null;
  const c = await cookies();
  const cookieId = c.get(COOKIE_NAME)?.value ?? FALLBACK_ADMIN_ID;
  const u = await db.query.users.findFirst({ where: eq(users.id, cookieId) });
  if (u) return u;
  const fallback = await db.query.users.findFirst({
    where: eq(users.id, FALLBACK_ADMIN_ID),
  });
  return fallback ?? null;
}

export async function listUsers(): Promise<User[]> {
  if (!isTestMode()) return [];
  return await db.query.users.findMany({
    where: eq(users.isActive, true),
  });
}

export { COOKIE_NAME as MOCK_USER_COOKIE };
