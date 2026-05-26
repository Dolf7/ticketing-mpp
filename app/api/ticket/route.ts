import { NextResponse } from "next/server";
import TicketValidator from "../../../services/ticketing/ticket-validator";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const provided = request.headers.get("x-validate-secret") ?? "";
  const expected = process.env.VALIDATION_SECRET ?? "";
  return !!expected && provided === expected;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request))
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const limitParam = Number(url.searchParams.get("limit") ?? "25");
    const validator = new TicketValidator();
    const tickets = await validator.listTickets(query, limitParam);

    return NextResponse.json({ tickets }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request))
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    const ticketCode = String(body?.ticketCode ?? body?.code ?? "").trim();
    const owner = typeof body?.owner === "string" ? body.owner : body?.name;

    if (!ticketCode)
      return NextResponse.json({ error: "Missing ticket code" }, { status: 400 });

    const validator = new TicketValidator();
    const existing = await validator.findByCode(ticketCode);
    if (existing)
      return NextResponse.json({ error: "Ticket code already exists" }, { status: 409 });

    const created = await validator.createTicket(ticketCode, typeof owner === "string" ? owner : null);
    if (!created)
      return NextResponse.json({ error: "Unable to create ticket" }, { status: 500 });

    return NextResponse.json({ ticket: created }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!isAuthorized(request))
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    const id = Number(body?.id);
    const owner = typeof body?.owner === "string" ? body.owner : body?.name;

    if (!Number.isInteger(id) || id <= 0)
      return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });

    const validator = new TicketValidator();
    const existing = await validator.findById(id);
    if (!existing)
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    const updated = await validator.updateOwner(id, typeof owner === "string" ? owner : null);
    if (!updated)
      return NextResponse.json({ error: "Unable to update ticket" }, { status: 500 });

    return NextResponse.json({ ticket: updated }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!isAuthorized(request))
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    const id = Number(body?.id);
    const validate = body?.validate;

    if (!Number.isInteger(id) || id <= 0)
      return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });

    if (typeof validate !== "boolean")
      return NextResponse.json({ error: "Missing validate state" }, { status: 400 });

    const validator = new TicketValidator();
    const existing = await validator.findById(id);
    if (!existing)
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    const updated = await validator.setValidated(id, validate);
    if (!updated)
      return NextResponse.json({ error: "Unable to update ticket" }, { status: 500 });

    return NextResponse.json({ ticket: updated }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}