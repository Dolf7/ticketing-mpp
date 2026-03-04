import SpreadsheetConfig from "@/services/spreadSheet/spreadsheet.config";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await SpreadsheetConfig.ensureSecretsGapiJson();

    return NextResponse.json(
      { ok: true, message: "secrets-gapi.json present or created" },
      { status: 200 },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
