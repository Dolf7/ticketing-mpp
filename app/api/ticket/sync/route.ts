import { NextResponse } from "next/server";
import TicketingSpreadsheet from "../../../../services/spreadSheet/ticketing-spreadsheet";
import prisma from "../../../../services/db/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dryRun = (url.searchParams.get("dryRun") ?? "") === "true" || (url.searchParams.get("dryRun") ?? "") === "1";
    const limitStr = url.searchParams.get("limit");
    const limit = limitStr ? Number(limitStr) : undefined;

    // Optional protection: if SYNC_SECRET or VALIDATION_SECRET is set, require matching header.
    const requiredSecret = process.env.SYNC_SECRET ?? process.env.VALIDATION_SECRET ?? "";
    if (requiredSecret && requiredSecret !== "") {
      const provided = request.headers.get("x-sync-secret") ?? request.headers.get("x-validate-secret") ?? "";
      if (!provided || provided !== requiredSecret)
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const sheet = new TicketingSpreadsheet("Ticket");
    await sheet.CreateConnection();

    const resp = await sheet.GetSheetRange("A2", "O");
    const rows: any[][] = resp?.values ?? [];

    const workRows = typeof limit === "number" && limit > 0 ? rows.slice(0, limit) : rows;

    const totalRows = workRows.length;
    const rowResults: any[] = [];
    const errors: any[] = [];
    let created = 0;
    let exists = 0;

    for (let i = 0; i < workRows.length; i++) {
      const row = workRows[i] ?? [];
      const sheetRowNumber = i + 2; // since we read from A2

      const owner = row[3] ?? null; // column D
      const ticketCodeRaw = row[14] ?? ""; // column O
      const ticketCode = String(ticketCodeRaw ?? "").trim();

      if (!ticketCode) {
        // skip rows without a ticket code
        continue;
      }

      try {
        const found = await prisma.ticket.findUnique({ where: { ticketCode } });
        if (found) {
          exists++;
          rowResults.push({ row: sheetRowNumber, ticketCode, owner, action: "exists" });
        } else {
          created++;
          rowResults.push({ row: sheetRowNumber, ticketCode, owner, action: "create" });
          if (!dryRun) {
            await prisma.ticket.create({ data: { ticketCode, owner: owner ? String(owner) : null, validate: false } });
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ row: sheetRowNumber, error: msg });
      }
    }

    const summary = { totalRows, created, exists, dryRun };
    return NextResponse.json({ summary, rows: rowResults, errors }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
