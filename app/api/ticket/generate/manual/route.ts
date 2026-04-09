import { NextResponse } from "next/server";
import TicketGenerator from "../../../../../services/ticketing/ticket-generator";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    const wijk = url.searchParams.get("wijk");
    const phoneNumber = url.searchParams.get("phoneNumber");

    if (!name || !phoneNumber)
      return NextResponse.json(
        { error: "Missing row parameter" },
        { status: 400 },
      );

    const generator = new TicketGenerator();
    const result = await generator.generateTicketManual(name, wijk, phoneNumber);

    if (!result.image) {
      const errDetail = result.error ?? 'Image not generated';
      return NextResponse.json(
        { success: false, error: errDetail },
        { status: 422 },
      );
    }

    const { fileName, buffer } = result.image;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Response(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
