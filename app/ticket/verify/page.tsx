import React from "react";
import TicketVerifier from "./TicketVerifier";

export const metadata = {
  title: "Ticket Verification",
};

export default function Page() {
  return (
    <main style={{ padding: 20 }}>
      <h1>Ticket Verification</h1>
      <p>Scan, upload, or enter a ticket code and click Validate.</p>
      <TicketVerifier />
    </main>
  );
}
