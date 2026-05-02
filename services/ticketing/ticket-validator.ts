import prisma from "../db/prisma";
import createLogger from "../logger";

const logger = createLogger("TicketValidator");

export default class TicketValidator {
  constructor() {}

  public async findByCode(code: string): Promise<{
    row: number;
    name: string | null;
    status: string | null;
    code: string;
  } | null> {
    try {
      const ticket = await prisma.ticket.findUnique({ where: { ticketCode: code } });
      if (!ticket) return null;

      const status = ticket.validate ? "REDEEMED" : "VALID";
      return { row: ticket.id, name: ticket.owner ?? null, status, code: ticket.ticketCode };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("findByCode error", { error: msg });
      return null;
    }
  }

  public async markRedeemed(row: number, _value = "REDEEMED"): Promise<boolean> {
    try {
      const updated = await prisma.ticket.update({ where: { id: row }, data: { validate: true } });
      return !!updated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("markRedeemed error", { error: msg });
      return false;
    }
  }
}
