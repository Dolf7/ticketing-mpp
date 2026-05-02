import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const provided = body?.secret ?? "";
    const expected = process.env.VALIDATION_SECRET ?? "";
    if (!expected || provided !== expected)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
