/**
 * テスト用: 現在のロール（mock user）を切り替えるためのエンドポイント。
 * POST { userId } で cookie `mock_user_id` を更新する。
 */
import { NextResponse } from "next/server";
import { MOCK_USER_COOKIE } from "@/lib/test-mode";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" ? body.userId : null;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true, userId });
  res.cookies.set(MOCK_USER_COOKIE, userId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
