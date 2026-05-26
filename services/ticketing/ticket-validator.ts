import prisma from "../db/prisma";
import createLogger from "../logger";

const logger = createLogger("TicketValidator");

export type TicketRecord = {
  id: number;
  ticketCode: string;
  owner: string | null;
  validate: boolean;
  status: "REDEEMED" | "VALID";
};

export default class TicketValidator {
  constructor() {}

  private mapTicket(ticket: {
    id: number;
    ticketCode: string;
    owner: string | null;
    validate: boolean;
  }): TicketRecord {
    return {
      id: ticket.id,
      ticketCode: ticket.ticketCode,
      owner: ticket.owner ?? null,
      validate: ticket.validate,
      status: ticket.validate ? "REDEEMED" : "VALID",
    };
  }

  public async findByCode(code: string): Promise<{
    row: number;
    name: string | null;
    status: string | null;
    code: string;
  } | null> {
    try {
      const ticket = await prisma.ticket.findUnique({ where: { ticketCode: code } });
      if (!ticket) return null;

      const mapped = this.mapTicket(ticket);
      return { row: mapped.id, name: mapped.owner, status: mapped.status, code: mapped.ticketCode };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("findByCode error", { error: msg });
      return null;
    }
  }

  public async listTickets(query?: string, limit = 25): Promise<TicketRecord[]> {
    try {
      const trimmedQuery = query?.trim();
      const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25;
      const tickets = await prisma.ticket.findMany({
        where: trimmedQuery
          ? {
              OR: [
                { ticketCode: { contains: trimmedQuery, mode: "insensitive" } },
                { owner: { contains: trimmedQuery, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: [{ id: "desc" }],
        take: safeLimit,
      });

      return tickets.map((ticket) => this.mapTicket(ticket));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("listTickets error", { error: msg, query, limit });
      return [];
    }
  }

  public async findById(id: number): Promise<TicketRecord | null> {
    try {
      const ticket = await prisma.ticket.findUnique({ where: { id } });
      return ticket ? this.mapTicket(ticket) : null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("findById error", { error: msg, id });
      return null;
    }
  }

  public async createTicket(ticketCode: string, owner?: string | null): Promise<TicketRecord | null> {
    try {
      const created = await prisma.ticket.create({
        data: {
          ticketCode: ticketCode.trim(),
          owner: owner?.trim() ? owner.trim() : null,
        },
      });

      return this.mapTicket(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("createTicket error", { error: msg, ticketCode });
      return null;
    }
  }

  public async updateOwner(id: number, owner?: string | null): Promise<TicketRecord | null> {
    try {
      const updated = await prisma.ticket.update({
        where: { id },
        data: { owner: owner?.trim() ? owner.trim() : null },
      });

      return this.mapTicket(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("updateOwner error", { error: msg, id });
      return null;
    }
  }

  public async setValidated(id: number, validate: boolean): Promise<TicketRecord | null> {
    try {
      const updated = await prisma.ticket.update({
        where: { id },
        data: { validate },
      });

      return this.mapTicket(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("setValidated error", { error: msg, id, validate });
      return null;
    }
  }

  public async markRedeemed(row: number): Promise<boolean> {
    const updated = await this.setValidated(row, true);
    return !!updated;
  }
}
