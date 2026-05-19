/**
 * テストモード用の「現在のユーザー」解決。
 * Phase 0/1 では認証をバイパスしているため、ここで cookie ベースに身代わりを置く。
 *
 * - cookie `mock_user_id` があればそれを採用
 * - 無ければ最初の管理者ユーザー（seed で投入された test-admin-sasaki）を採用
 *
 * 本番化時はこのファイル全体を削除して NextAuth の `auth()` に差し替える。
 */
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { users, type User } from "@/db/schema";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "mock_user_id";
const FALLBACK_ADMIN_ID = "test-admin-sasaki";

export async function getCurrentUser(): Promise<User | null> {
  const c = await cookies();
  const cookieId = c.get(COOKIE_NAME)?.value ?? FALLBACK_ADMIN_ID;
  const u = await db.query.users.findFirst({ where: eq(users.id, cookieId) });
  if (u) return u;
  // cookie が壊れていれば admin に戻す
  const fallback = await db.query.users.findFirst({
    where: eq(users.id, FALLBACK_ADMIN_ID),
  });
  return fallback ?? null;
}

export async function listUsers(): Promise<User[]> {
  return await db.query.users.findMany({
    where: eq(users.isActive, true),
  });
}

export { COOKIE_NAME as MOCK_USER_COOKIE };
