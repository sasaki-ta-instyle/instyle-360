import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      app: "instyle-360",
      ts: new Date().toISOString(),
    },
    { status: 200 },
  );
}
