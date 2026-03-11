import TicketingSpreadsheet from "../spreadSheet/ticketing-spreadsheet";
import QRCode from 'qrcode';
import composeTicketImage from './ticket-image';

export default class TicketGenerator {
    private ticketing: TicketingSpreadsheet

    constructor() {
        this.ticketing = new TicketingSpreadsheet("Ticket");
    }

    public async generateTicket(rowNumber: number): Promise<{ code: string | null, image?: { fileName: string, buffer: Buffer } | null }> {
        try {
            await this.ticketing.CreateConnection();

            const colD = await this.ticketing.GetSheetSingelRange(`D${rowNumber}`);
            const buyerName = colD?.values?.[0]?.[0] ?? '';

            const colN = await this.ticketing.GetSheetSingelRange(`N${rowNumber}`);
            const status = colN?.values?.[0]?.[0] ?? '';

            const colB = await this.ticketing.GetSheetSingelRange(`C${rowNumber}`);
            const ticketNumber = colB?.values?.[0]?.[0] ?? '';

            const colO = await this.ticketing.GetSheetSingelRange(`O${rowNumber}`);
            const ticketCode = colO?.values?.[0]?.[0] ?? '';

            const errors: string[] = [];

            if (!buyerName || String(buyerName).trim() === '') {
                errors.push('Buyer name empty (D)');
            }

            if (String(status).trim() !== 'Lunas') {
                errors.push(`Status not Lunas (N) - Status :${status}`);
            }

            if (!ticketNumber || String(ticketNumber).trim() === '') {
                errors.push('Ticket number missing (C)');
            }

            if (errors.length > 0) {
                const errMsg = errors.join(' | ');
                await this.ticketing.UpdateSheetSingleRange(`Q${rowNumber}`, errMsg);
                return { code: null, image: null };
            }

            // If a ticket code already exists in column O, use it to generate the image
            const existingCode = ticketCode && String(ticketCode).trim() !== '' ? String(ticketCode).trim() : null;
            if (existingCode) {
                const code = existingCode;
                const fileName = `${code}.png`;
                const qrBuffer = await QRCode.toBuffer(code, { type: 'png' });

                // compose final ticket image (template + qr + name + code)
                const composed = await composeTicketImage({ qrBuffer, buyerName: String(buyerName), ticketCode: code });

                // clear any previous error in Q cell
                await this.ticketing.UpdateSheetSingleRange(`Q${rowNumber}`, '');
                // keep existing O value; just clear P (if used for temp/upload status)
                await this.ticketing.UpdateSheetSingleRange(`P${rowNumber}`, '');

                return { code, image: { fileName, buffer: composed } };
            }

            const rawPrefix = String(buyerName).trim();
            const prefix = rawPrefix.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50) || 'NoTicket';
            const code = `${ticketNumber}-${prefix}-MPP-${this.randomString(5)}`;

            const fileName = `${code}.png`;


            // generate QR into a buffer (no filesystem required)
            const qrBuffer = await QRCode.toBuffer(code, { type: 'png' });

            // compose final ticket image (template + qr + name + code)
            const buffer = await composeTicketImage({ qrBuffer, buyerName: String(buyerName), ticketCode: code });

            // clear any previous error in Q cell
            await this.ticketing.UpdateSheetSingleRange(`Q${rowNumber}`, '');

            // write generated code to column O; do not upload to Drive in this environment
            await this.ticketing.UpdateSheetSingleRange(`O${rowNumber}`, code);
            await this.ticketing.UpdateSheetSingleRange(`P${rowNumber}`, '');

            return { code, image: { fileName, buffer } };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            try { await this.ticketing.UpdateSheetSingleRange(`Q${rowNumber}`, `Exception: ${msg}`); } catch { }
            return { code: null, image: null };
        }
    }

    public async GetTicketInfo(rowNumber: number): Promise<{ name: string | null, code: string | null, status: string | null }> {

        try {
            await this.ticketing.CreateConnection();

            const colD = await this.ticketing.GetSheetSingelRange(`D${rowNumber}`);
            const buyerName = colD?.values?.[0]?.[0] ?? '';

            const colN = await this.ticketing.GetSheetSingelRange(`N${rowNumber}`);
            const status = colN?.values?.[0]?.[0] ?? '';

            const colB = await this.ticketing.GetSheetSingelRange(`B${rowNumber}`);
            const ticketNumber = colB?.values?.[0]?.[0] ?? '';

            return { name: buyerName, code: ticketNumber, status: status }
        }
        catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            try { await this.ticketing.UpdateSheetSingleRange(`Q${rowNumber}`, `Exception: ${msg}`); } catch { }
            return { name: null, code: null, status: null };
        }
    }

    private randomString(length: number) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    }

}