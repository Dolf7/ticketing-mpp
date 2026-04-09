import { google, sheets_v4 } from "googleapis";
import getAuthClient from "./google-auth";
import SpreadsheetConfig from "./spreadsheet.config";
import createLogger from "../logger";

const logger = createLogger("TicketingSpreadsheet");

export default class TicketingSpreadsheet {
  private _sheetSelection: string;
  private _spreadsheets: sheets_v4.Sheets | null = null;

  constructor(sheet: string) {
    this._sheetSelection = sheet;
  }

  public async CreateConnection(): Promise<void> {
    // get auth client (supports SECRET_GAPI_JSON env or secrets-gapi.json file)
    logger.debug("Creating spreadsheet connection");
    const auth = await getAuthClient([
      "https://www.googleapis.com/auth/spreadsheets",
    ]);

    this._spreadsheets = google.sheets({ version: "v4", auth });
    logger.info("Spreadsheet connection created");
  }

  public async GetSheetSingelRange(
    range: string,
  ): Promise<sheets_v4.Schema$ValueRange | null> {
    const fixRange = `${this._sheetSelection}!${range}`;
    return this.getResponse(fixRange);
  }

  public async UpdateSheetSingleRange(
    range: string,
    value: string,
  ): Promise<boolean> {
    const fixRange = `${this._sheetSelection}!${range}`;

    if (this._spreadsheets == null) return false;

    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) return false;

    await this._spreadsheets.spreadsheets.values.update({
      spreadsheetId,
      range: fixRange,
      valueInputOption: "RAW",
      requestBody: { values: [[value]] },
    });

    logger.debug("Updated sheet single range", { range: fixRange, value });

    return true;
  }

  public async GetSheetRange(
    range1: string,
    range2: string,
  ): Promise<sheets_v4.Schema$ValueRange | null> {
    const fixRange = `${this._sheetSelection}!${range1}:${range2}`;
    return this.getResponse(fixRange);
  }

  public async appendRow(values: any[][]): Promise<boolean> {
    if (this._spreadsheets == null) return false;

    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) return false;

    try {
      await this._spreadsheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${this._sheetSelection}!A1`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values },
      });

      logger.debug("Appended row to sheet", { sheet: this._sheetSelection });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to append row", { error: msg });
      return false;
    }
  }

  // Append a single row at the first empty row at the bottom of the sheet
  public async appendRowAtBottom(rowValues: any[]): Promise<boolean> {
    if (this._spreadsheets == null) return false;

    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) return false;

    try {
      // Compute next row using column B (date) to avoid misalignment when column A is empty.
      const colB = await this.GetSheetRange("B", "B");
      const rows = colB?.values ?? [];
      const nextRow = rows.length + 1;

      const desiredCols = 15; // A..O
      const padded = rowValues.slice(0, desiredCols);
      while (padded.length < desiredCols) padded.push("");

      // Try server-side append first (atomic). If it doesn't behave correctly for some sheets,
      // fall back to a read-check-update loop with retries.
      try {
        await this._spreadsheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${this._sheetSelection}!A:O`,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: [padded] },
        });
        logger.debug("Appended row via append", {
          sheet: this._sheetSelection,
        });
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("Append failed, falling back to safe update", {
          error: msg,
        });
      }

      // Fallback: try to compute next empty row by checking column B and verifying row A:O is empty.
      const maxRetries = 8;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      try {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          const colB = await this.GetSheetRange("B", "B");
          const rows = colB?.values ?? [];
          const candidate = rows.length + 1 + attempt; // shift down on subsequent attempts

          // read current contents of A:O at candidate row
          const rangeCheck = `${this._sheetSelection}!A${candidate}:O${candidate}`;
          const resp = await this.getResponse(rangeCheck);
          const cells = resp?.values?.[0] ?? [];

          const isEmpty = cells.every(
            (c: unknown) =>
              c === undefined || c === null || String(c).trim() === "",
          );
          if (!isEmpty) {
            // someone already used this row; retry
            await sleep(60 * (attempt + 1));
            continue;
          }

          // write the row
          const writeRange = `${this._sheetSelection}!A${candidate}:O${candidate}`;
          await this._spreadsheets.spreadsheets.values.update({
            spreadsheetId,
            range: writeRange,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [padded] },
          });

          logger.debug("Safely appended row at", {
            sheet: this._sheetSelection,
            row: candidate,
          });
          return true;
        }
        logger.error("Failed to append row after retries (fallback)");
        return false;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Failed in append fallback", { error: msg });
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed in append fallback", { error: msg });
      return false;
    }
  }

  private async getResponse(
    range: string,
  ): Promise<sheets_v4.Schema$ValueRange | null> {
    if (this._spreadsheets == null) return null;

    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) return null;

    const response = await this._spreadsheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    logger.debug("Fetched sheet range", { range });
    return response.data ?? null;
  }
}
