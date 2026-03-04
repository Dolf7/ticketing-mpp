import { google, sheets_v4 } from "googleapis";
import SpreadsheetConfig from "./spreadsheet.config";

export default class TicketingSpreadsheet {
    private _sheetSelection: string;
    private _spreadsheets: sheets_v4.Sheets | null = null;

    constructor(sheet: string) {
        this._sheetSelection = sheet;
    }

    public async CreateConnection(): Promise<void> {
        // ensure the credentials exist
        SpreadsheetConfig.ensureSecretsGapiJson()

        // Configure
        const auth = await google.auth.getClient({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
        this._spreadsheets = google.sheets({ version: 'v4', auth });
    }

    public async GetSheetSingelRange(range: string): Promise<sheets_v4.Schema$ValueRange | null> {
        const fixRange = `${this._sheetSelection}!${range}`;
        return this.getResponse(fixRange);
    }

    public async UpdateSheetSingleRange(range: string, value: string): Promise<boolean> {
        const fixRange = `${this._sheetSelection}!${range}`;

        if (this._spreadsheets == null) return false;

        const spreadsheetId = process.env.SHEET_ID;
        if (!spreadsheetId) return false;

        await this._spreadsheets.spreadsheets.values.update({
            spreadsheetId,
            range: fixRange,
            valueInputOption: 'RAW',
            requestBody: { values: [[value]] },
        });

        return true;
    }

    public async GetSheetRange(range1: string, range2: string): Promise<sheets_v4.Schema$ValueRange | null> {
        const fixRange = `${this._sheetSelection}!${range1}:${range2}`;
        return this.getResponse(fixRange);
    }

    private async getResponse(range: string): Promise<sheets_v4.Schema$ValueRange | null> {
        if (this._spreadsheets == null) return null;

        const spreadsheetId = process.env.SHEET_ID;
        if (!spreadsheetId) return null;

        const response = await this._spreadsheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        return response.data ?? null;
    }
}