import TicketingSpreadsheet from "../spreadSheet/ticketing-spreadsheet";
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

export default class TicketGenerator {
    private ticketing: TicketingSpreadsheet

    constructor() {
        this.ticketing = new TicketingSpreadsheet("Ticket");
    }

    public async generateTicket(rowNumber: number): Promise<{ code: string | null, imagePath: string | null }> {
        try {
            await this.ticketing.CreateConnection();

            const colD= await this.ticketing.GetSheetSingelRange(`D${rowNumber}`);
            const buyerName = colD?.values?.[0]?.[0] ?? '';

            const colN = await this.ticketing.GetSheetSingelRange(`N${rowNumber}`);
            const status = colN?.values?.[0]?.[0] ?? '';

            const colB = await this.ticketing.GetSheetSingelRange(`B${rowNumber}`);
            const ticketNumber = colB?.values?.[0]?.[0] ?? '';

            const errors: string[] = [];

            if (!buyerName || String(buyerName).trim() === '') {
                errors.push('Buyer name empty (D)');
            }

            if (String(status).trim() !== 'Lunas') {
                errors.push(`Status not Lunas (N) - Status :${status}`);
            }

            if (!ticketNumber || String(ticketNumber).trim() === '') {
                errors.push('Ticket number missing (B)');
            }

            if (errors.length > 0) {
                const errMsg = errors.join(' | ');
                await this.ticketing.UpdateSheetSingleRange(`Q${rowNumber}`, errMsg);
                return { code: null, imagePath: null };
            }

            const rawPrefix = String(buyerName).trim();
            const prefix = rawPrefix.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50) || 'NoTicket';
            const code = `${prefix}_MPP_${this.randomString(7)}`;

            const outDir = path.join(process.cwd(), 'public', 'generated-ticket');
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

            const fileName = `${code}.png`;
            const filePath = path.join(outDir, fileName);

            await QRCode.toFile(filePath, code, { type: 'png' });

            // clear any previous error in Q cell
            await this.ticketing.UpdateSheetSingleRange(`Q${rowNumber}`, '');

            const publicPath = `/generated-ticket/${fileName}`;

            // write generated code to column O and link to column P
            await this.ticketing.UpdateSheetSingleRange(`O${rowNumber}`, code);
            await this.ticketing.UpdateSheetSingleRange(`P${rowNumber}`, publicPath);

            return { code, imagePath: publicPath };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            try { await this.ticketing.UpdateSheetSingleRange(`Q${rowNumber}`, `Exception: ${msg}`); } catch { }
            return { code: null, imagePath: null };
        }
    }

    private randomString(length: number) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    }

}