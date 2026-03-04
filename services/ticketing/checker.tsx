import ticketingSpreadsheet from "../spreadSheet/ticketing-spreadsheet";

export default class ticketChecker {
    ticketing: ticketingSpreadsheet

    constructor() {
        this.ticketing = new ticketingSpreadsheet("Ticket");
    }

}