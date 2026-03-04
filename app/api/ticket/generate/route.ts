import { NextResponse } from 'next/server';
import TicketGenerator from '../../../../services/ticketing/ticket-generator';

export const runtime = 'nodejs';

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const rowParam = url.searchParams.get('row');

        if (!rowParam) return NextResponse.json({ error: 'Missing row parameter' }, { status: 400 });

        const row = Number(rowParam);
        if (!Number.isInteger(row) || row <= 0) return NextResponse.json({ error: 'Invalid row parameter' }, { status: 400 });

        const generator = new TicketGenerator();
        const result = await generator.generateTicket(row);

        if (!result.code) {
            return NextResponse.json({ success: false, code: result.code, imagePath: result.imagePath }, { status: 422 });
        }

        return NextResponse.json({ success: true, code: result.code, imagePath: result.imagePath });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
