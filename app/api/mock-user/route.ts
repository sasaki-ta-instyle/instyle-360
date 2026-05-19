/**
 * テスト用: 現在のロール（mock user）を切り替えるためのエンドポイント。
 * `TEST_MODE !== "1"` のときは 404 を返して何もしない。
 */
import { NextResponse } from "next/server";
import { MOCK_USER_COOKIE, isTestMode } from "@/lib/test-mode";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isTestMode()) {
    return new NextResponse(null, { status: 404 });
  }
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
