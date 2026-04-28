import TicketingSpreadsheet from "../spreadSheet/ticketing-spreadsheet";
import createLogger from "../logger";

const logger = createLogger("TicketValidator");

export default class TicketValidator {
  private ticketing: TicketingSpreadsheet;

  constructor() {
    this.ticketing = new TicketingSpreadsheet("Ticket");
  }

  public async findByCode(code: string): Promise<{
    row: number;
    name: string | null;
    status: string | null;
    code: string;
  } | null> {
    try {
      await this.ticketing.CreateConnection();

      const colO = await this.ticketing.GetSheetRange("O", "O");
      const values = colO?.values ?? [];

      for (let i = 0; i < values.length; i++) {
        const cell = values[i]?.[0];
        if (cell && String(cell).trim() === code) {
          const rowNumber = i + 1;
          const colD = await this.ticketing.GetSheetSingelRange(`D${rowNumber}`);
          const name = colD?.values?.[0]?.[0] ?? null;
          const colN = await this.ticketing.GetSheetSingelRange(`N${rowNumber}`);
          const status = colN?.values?.[0]?.[0] ?? null;
          return { row: rowNumber, name, status, code: String(cell) };
        }
      }

      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("findByCode error", { error: msg });
      return null;
    }
  }

  public async markRedeemed(row: number, value = "REDEEMED"): Promise<boolean> {
    try {
      await this.ticketing.CreateConnection();
      return await this.ticketing.UpdateSheetSingleRange(`N${row}`, value);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("markRedeemed error", { error: msg });
      return false;
    }
  }
}
