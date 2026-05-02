import { NextResponse } from "next/server";
import TicketValidator from "../../../../services/ticketing/ticket-validator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = body?.code;
    const markUsed = Boolean(body?.markUsed);

    // Require validation secret on every request
    const provided = request.headers.get("x-validate-secret") ?? "";
    const secret = process.env.VALIDATION_SECRET ?? "";
    if (!secret || provided !== secret)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    if (!code || String(code).trim() === "")
      return NextResponse.json({ error: "Missing code" }, { status: 400 });

    const validator = new TicketValidator();
    const found = await validator.findByCode(String(code).trim());

    if (!found) return NextResponse.json({ found: false }, { status: 200 });

    if (markUsed) {
      const provided = request.headers.get("x-validate-secret") ?? "";
      const secret = process.env.VALIDATION_SECRET ?? "";
      if (!secret || provided !== secret)
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

      const ok = await validator.markRedeemed(found.row, "REDEEMED");
      return NextResponse.json(
        { found: true, row: found.row, name: found.name, status: ok ? "REDEEMED" : found.status },
        { status: 200 },
      );
    }

    return NextResponse.json({ found: true, row: found.row, name: found.name, status: found.status }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
