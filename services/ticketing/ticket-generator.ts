import TicketingSpreadsheet from "../spreadSheet/ticketing-spreadsheet";
import QRCode from "qrcode";
import composeTicketImage from "./ticket-image";
import createLogger from "../logger";
import { exit } from "process";

const logger = createLogger("TicketGenerator");

export default class TicketGenerator {
  private ticketing: TicketingSpreadsheet;

  constructor() {
    this.ticketing = new TicketingSpreadsheet("Ticket");
  }

  public async generateTicket(rowNumber: number): Promise<{
    code: string | null;
    image?: { fileName: string; buffer: Buffer } | null;
    error?: string | null;
  }> {
    try {
      logger.info("generateTicket start", { rowNumber });
      await this.ticketing.CreateConnection();

      const colD = await this.ticketing.GetSheetSingelRange(`D${rowNumber}`);
      const buyerName = colD?.values?.[0]?.[0] ?? "";

      const colN = await this.ticketing.GetSheetSingelRange(`N${rowNumber}`);
      const status = colN?.values?.[0]?.[0] ?? "";

    //   const colB = await this.ticketing.GetSheetSingelRange(`C${rowNumber}`);
    //   const ticketNumber = colB?.values?.[0]?.[0] ?? "";

      const colO = await this.ticketing.GetSheetSingelRange(`O${rowNumber}`);
      const ticketCode = colO?.values?.[0]?.[0] ?? "";

      const errors: string[] = [];

      if (!buyerName || String(buyerName).trim() === "") {
        errors.push("Buyer name empty (D)");
      }

      if (errors.length > 0) {
        const errMsg = errors.join(" | ");
        logger.warn("Validation failed", { rowNumber, errors });
        await this.ticketing.UpdateSheetSingleRange(`Q${rowNumber}`, errMsg);
        return { code: null, image: null, error: errMsg };
      }

      // If a ticket code already exists in column O, use it to generate the image
      const existingCode =
        ticketCode && String(ticketCode).trim() !== ""
          ? String(ticketCode).trim()
          : null;
      if (existingCode) {
        const code = existingCode;
        const fileName = `${code}.png`;
        const qrBuffer = await QRCode.toBuffer(code, { type: "png" });

        // compose final ticket image (template + qr + name + code)
        logger.info("Composing ticket image using existing code", {
          code,
          rowNumber,
        });
        const composed = await composeTicketImage({
          qrBuffer,
          buyerName: String(buyerName),
          ticketCode: code,
        });

        // clear any previous error in Q cell
        await this.ticketing.UpdateSheetSingleRange(`Q${rowNumber}`, "");
        // keep existing O value; just clear P (if used for temp/upload status)
        await this.ticketing.UpdateSheetSingleRange(`P${rowNumber}`, "");

        logger.info("Ticket image generated (existing code)", {
          code,
          rowNumber,
        });
        return { code, image: { fileName, buffer: composed }, error: null };
      }

      const rawPrefix = String(buyerName).trim();
      const code = `${rawPrefix}-MPP-${this.randomString(5)}`;

      const fileName = `${code}.png`;

      // generate QR into a buffer (no filesystem required)
      const qrBuffer = await QRCode.toBuffer(code, { type: "png" });

      logger.info("Composing ticket image", { code, rowNumber });
      // compose final ticket image (template + qr + name + code)
      const buffer = await composeTicketImage({
        qrBuffer,
        buyerName: String(buyerName),
        ticketCode: code,
      });

      // clear any previous error in Q cell
      await this.ticketing.UpdateSheetSingleRange(`Q${rowNumber}`, "");

      // write generated code to column O; do not upload to Drive in this environment
      await this.ticketing.UpdateSheetSingleRange(`O${rowNumber}`, code);
      logger.info("Ticket generated and saved to sheet", { code, rowNumber });
      await this.ticketing.UpdateSheetSingleRange(`P${rowNumber}`, "");

      return { code, image: { fileName, buffer }, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("generateTicket exception", { rowNumber, error: msg });
      try {
        await this.ticketing.UpdateSheetSingleRange(
          `Q${rowNumber}`,
          `Exception: ${msg}`,
        );
      } catch {}
      return { code: null, image: null, error: msg };
    }
  }

  public async generateTicketManual(name: string, wijk: string|null, nomorHp: string|null): Promise<{
    code: string | null;
    image?: { fileName: string; buffer: Buffer } | null;
    error?: string | null;
  }> {
    try {
      logger.info("generateTicket Manual Start for ", { name });
      await this.ticketing.CreateConnection();

      const errors: string[] = [];

      if (!name || String(name).trim() === "") {
        errors.push("name is empty");
      }

      if (errors.length > 0) {
        const errMsg = errors.join(" | ");
        logger.warn("Validation failed", { name, errors });
        return { code: null, image: null, error: errMsg };
      }

      const rawPrefix = String(name).trim();
      const code = `${rawPrefix}-MPP-${this.randomString(5)}`;

      const fileName = `${code}.png`;

      // generate QR into a buffer (no filesystem required)
      const qrBuffer = await QRCode.toBuffer(code, { type: "png" });

      logger.info("Composing ticket image", { code });
      // compose final ticket image (template + qr + name + code)
      const buffer = await composeTicketImage({
        qrBuffer,
        buyerName: String(name),
        ticketCode: code,
      });

      // Append a new row to the ticket sheet with required column mapping.
      try {
        const today = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const dateStr = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;

        const row: unknown[] = [
          "", // A (empty)
          dateStr, // B: Today Date (DD/MM/YYYY)
          "", // C: EMPTYR
          String(name), // D: Name
          "", // E: EMPTY
          wijk ?? "", // F: Wijk from parameters
          nomorHp ?? "", // G: nomorHp
          "1", // H: 1
          "", // I: EMPTY
          "", // J: EMPTY
          "", // K: EMPTY
          "", // L: EMPTY
          "", // M: EMPTY
          "LUNAS", // N: "LUNAS"
          code, // O: Ticket Code
        ];

        const appended = await this.ticketing.appendRow([row]);
        if (appended) {
          logger.info("Appended new ticket row to sheet", { code });
        } else {
          logger.warn("Failed to append new ticket row to sheet", { code });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Exception while appending row", { error: msg });
      }

      return { code, image: { fileName, buffer }, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("generateTicket exception", { name, error: msg });
      return { code: null, image: null, error: msg };
    }
  }

  public async GetTicketInfo(rowNumber: number): Promise<{
    name: string | null;
    code: string | null;
    status: string | null;
  }> {
    try {
      await this.ticketing.CreateConnection();

      const colD = await this.ticketing.GetSheetSingelRange(`D${rowNumber}`);
      const buyerName = colD?.values?.[0]?.[0] ?? "";

      const colN = await this.ticketing.GetSheetSingelRange(`N${rowNumber}`);
      const status = colN?.values?.[0]?.[0] ?? "";

      const colB = await this.ticketing.GetSheetSingelRange(`B${rowNumber}`);
      const ticketNumber = colB?.values?.[0]?.[0] ?? "";

      return { name: buyerName, code: ticketNumber, status: status };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        await this.ticketing.UpdateSheetSingleRange(
          `Q${rowNumber}`,
          `Exception: ${msg}`,
        );
      } catch {}
      return { name: null, code: null, status: null };
    }
  }

  private randomString(length: number) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++)
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  }
}
