"use client";

import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import styles from "./TicketVerifier.module.css";

type ScannerInstance = {
  start: () => Promise<void>;
  stop: () => void;
};

type ScannerConstructor = {
  new (
    video: HTMLVideoElement,
    onDecode: (result: unknown) => void,
    options?: Record<string, unknown>,
  ): ScannerInstance;
  WORKER_PATH?: string;
  scanImage: (file: File) => Promise<unknown>;
};

type TicketRow = {
  id: number;
  ticketCode: string;
  owner: string | null;
  validate: boolean;
  status: "VALID" | "REDEEMED";
};

type ValidationResult = {
  found?: boolean;
  row?: number;
  name?: string | null;
  status?: string | null;
  code?: string;
  error?: string;
};

type TicketListResponse = {
  tickets?: TicketRow[];
  error?: string;
};

type TicketMutationResponse = {
  ticket?: TicketRow;
  error?: string;
};

type ScanResultObject = { data?: string; rawValue?: string };

const qrScanner = QrScanner as unknown as ScannerConstructor;
const PAGE_SIZE = 20;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function extractScanText(result: unknown): string {
  if (typeof result === "string") return result;
  if (typeof result === "object" && result !== null) {
    const payload = result as ScanResultObject;
    return payload.data ?? payload.rawValue ?? JSON.stringify(result);
  }

  return String(result);
}

export default function TicketVerifier() {
  const [mode, setMode] = useState<"manual" | "camera" | "upload">("manual");
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ticketInfo, setTicketInfo] = useState<ValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showRedeemPrompt, setShowRedeemPrompt] = useState(false);
  const [redeemSecret, setRedeemSecret] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(true);
  const [authInput, setAuthInput] = useState("");
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [tableMessage, setTableMessage] = useState<string | null>(null);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);
  const [createCode, setCreateCode] = useState("");
  const [createOwner, setCreateOwner] = useState("");
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [ownerDrafts, setOwnerDrafts] = useState<Record<number, string>>({});
  const [rowActionKey, setRowActionKey] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<ScannerInstance | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const ticketsRequestRef = useRef(0);

  useEffect(() => {
    try {
      qrScanner.WORKER_PATH = "/qr-scanner-worker.min.js";
    } catch {}
  }, []);

  useEffect(() => {
    if (mode === "camera") {
      discoverDevices();
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedDeviceId]);

  useEffect(() => {
    const initAuth = async () => {
      const s = typeof window !== "undefined" ? sessionStorage.getItem("validateSecret") : null;
      if (s) {
        setRedeemSecret(s);
        try {
          const res = await fetch("/api/ticket/validate/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ secret: s }),
          });
          if (res.ok) {
            setIsAuthorized(true);
            setShowAuthPrompt(false);
          } else {
            sessionStorage.removeItem("validateSecret");
            setIsAuthorized(false);
            setRedeemSecret("");
            setShowAuthPrompt(true);
          }
        } catch {
          setShowAuthPrompt(true);
        }
      } else {
        setShowAuthPrompt(true);
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (!isAuthorized) {
      setTickets([]);
      setTableMessage(null);
      setCurrentPage(1);
      return;
    }

    void fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized]);

  useEffect(() => {
    setCurrentPage(1);
  }, [code]);

  const getStoredSecret = () => (typeof window !== "undefined" ? sessionStorage.getItem("validateSecret") ?? "" : "");

  const handleUnauthorized = (nextMessage = "Session expired. Please log in again.") => {
    sessionStorage.removeItem("validateSecret");
    setRedeemSecret("");
    setIsAuthorized(false);
    setShowAuthPrompt(true);
    setTableMessage(null);
    setTickets([]);
    setMessage(nextMessage);
  };

  const applyTicketRows = (nextTickets: TicketRow[]) => {
    setTickets(nextTickets);
    setOwnerDrafts((current) => {
      const nextDrafts: Record<number, string> = {};
      nextTickets.forEach((ticket) => {
        nextDrafts[ticket.id] = current[ticket.id] ?? ticket.owner ?? "";
      });
      return nextDrafts;
    });
  };

  const upsertTicketRow = (nextTicket: TicketRow, prepend = false) => {
    setTickets((current) => {
      const index = current.findIndex((ticket) => ticket.id === nextTicket.id);
      if (index === -1) return prepend ? [nextTicket, ...current] : [...current, nextTicket];
      return current.map((ticket) => ticket.id === nextTicket.id ? nextTicket : ticket);
    });
    setOwnerDrafts((current) => ({ ...current, [nextTicket.id]: nextTicket.owner ?? "" }));
    setTableMessage(null);
  };

  const patchTicketFromValidation = (result: ValidationResult) => {
    if (!result.row || !result.status) return;

    const validate = result.status === "REDEEMED";
    setTickets((current) => current.map((ticket) => (
      ticket.id === result.row
        ? {
            ...ticket,
            owner: result.name ?? ticket.owner,
            validate,
            status: validate ? "REDEEMED" : "VALID",
          }
        : ticket
    )));
    setOwnerDrafts((current) => ({
      ...current,
      [result.row as number]: result.name ?? current[result.row as number] ?? "",
    }));
  };

  const fetchTickets = async () => {
    const secret = redeemSecret || getStoredSecret();
    if (!secret) return;

    const requestId = ticketsRequestRef.current + 1;
    ticketsRequestRef.current = requestId;
    setIsTableLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("limit", "500");

      const res = await fetch(`/api/ticket?${params.toString()}`, {
        headers: { "x-validate-secret": secret },
      });

      if (requestId !== ticketsRequestRef.current) return;

      const json = (await res.json()) as TicketListResponse;
      if (!res.ok) {
        if (res.status === 403) {
          handleUnauthorized();
          return;
        }
        applyTicketRows([]);
        setTableMessage(json?.error ?? "Unable to load tickets");
        return;
      }

      const nextTickets = Array.isArray(json.tickets) ? json.tickets : [];
      applyTicketRows(nextTickets);
      setTableMessage(nextTickets.length === 0 ? "No tickets available yet." : null);
    } catch (err: unknown) {
      if (requestId !== ticketsRequestRef.current) return;
      setTableMessage("Network error: " + getErrorMessage(err));
    } finally {
      if (requestId === ticketsRequestRef.current) setIsTableLoading(false);
    }
  };

  const discoverDevices = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === "videoinput");
      setDevices(cams);
      if (!selectedDeviceId && cams.length > 0) setSelectedDeviceId(cams[0].deviceId);
    } catch {}
  };

  const startCamera = async () => {
    if (!videoRef.current) return;
    stopCamera();
    try {
      setScanning(true);
      const options: Record<string, unknown> = { returnDetailedScanResult: false, highlightScanRegion: true, highlightCodeOutline: true };
      if (selectedDeviceId) options["preferredCamera"] = selectedDeviceId;
      const scanner = new qrScanner(videoRef.current, (result: unknown) => {
        const text = extractScanText(result);
        setCode(text);
        setMessage("QR decoded from camera");
        setScanning(false);
        try {
          scanner.stop();
        } catch {}
        scannerRef.current = null;
      }, options);
      scannerRef.current = scanner;
      await scanner.start();
    } catch (err: unknown) {
      console.error(err);
      setMessage("Camera error: " + getErrorMessage(err));
      setScanning(false);
    }
  };

  const stopCamera = () => {
    try {
      if (scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current = null;
      }
    } catch {}
    setScanning(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreviewUrl(URL.createObjectURL(f));
    try {
      setMessage(null);
      const res = await qrScanner.scanImage(f);
      if (res) {
        const text = extractScanText(res);
        setCode(text);
        setMessage("QR decoded from image");
      } else {
        setMessage("No QR code found in image");
      }
    } catch (err: unknown) {
      setMessage("Error scanning image: " + getErrorMessage(err));
    }
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const doValidate = async (markUsed = false, targetCode?: string) => {
    setMessage(null);
    setTicketInfo(null);
    const codeToValidate = (targetCode ?? code).trim();

    if (!codeToValidate) {
      setMessage("Please provide a code first");
      return;
    }

    if (targetCode && targetCode !== code) setCode(targetCode);

    const saved = typeof window !== "undefined" ? sessionStorage.getItem("validateSecret") ?? "" : "";
    const secret = redeemSecret || saved;
    if (!secret) {
      setMessage("Not authorized. Please enter validation password.");
      setShowAuthPrompt(true);
      return;
    }
    setIsLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", "x-validate-secret": secret };
      const res = await fetch("/api/ticket/validate", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: codeToValidate, markUsed }),
      });
      const json = (await res.json()) as ValidationResult;
      if (!res.ok) {
        setMessage(json?.error ?? "Validation error");
        if (res.status === 403) {
          handleUnauthorized();
        }
      } else {
        setTicketInfo(json);
        setMessage(json?.found ? "Ticket found" : "Ticket not found");
        if (json?.found) patchTicketFromValidation(json);
      }
    } catch (err: unknown) {
      setMessage("Network error: " + getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const confirmRedeem = async () => {
    if (!code || code.trim() === "") return;
    const saved = typeof window !== "undefined" ? sessionStorage.getItem("validateSecret") ?? "" : "";
    const secret = redeemSecret || saved;
    if (!secret) {
      setMessage("Not authorized. Please enter validation password.");
      setShowAuthPrompt(true);
      return;
    }
    setIsLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", "x-validate-secret": secret };
      const res = await fetch("/api/ticket/validate", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: code.trim(), markUsed: true }),
      });
      const json = (await res.json()) as ValidationResult;
      if (!res.ok) {
        setMessage(json?.error ?? "Redeem error");
        if (res.status === 403) {
          handleUnauthorized();
        }
      } else {
        setTicketInfo(json);
        setMessage("Redeemed");
        setShowRedeemPrompt(false);
        patchTicketFromValidation(json);
      }
    } catch (err: unknown) {
      setMessage("Network error: " + getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const submitAuth = async () => {
    if (!authInput || authInput.trim() === "") {
      setMessage("Enter validation password");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/ticket/validate/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: authInput.trim() }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setMessage(json?.error ?? "Unauthorized");
        setIsAuthorized(false);
      } else {
        sessionStorage.setItem("validateSecret", authInput.trim());
        setRedeemSecret(authInput.trim());
        setIsAuthorized(true);
        setShowAuthPrompt(false);
        setMessage("Authorized");
      }
    } catch (err: unknown) {
      setMessage("Network error: " + getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem("validateSecret");
    setRedeemSecret("");
    setIsAuthorized(false);
    setShowAuthPrompt(true);
    setTickets([]);
    setTableMessage(null);
    setMessage("Logged out");
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Code copied to clipboard");
    } catch {
      setMessage("Copy failed");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") doValidate(false);
  };

  const openCreatePrompt = () => {
    setCreateCode(code.trim());
    setCreateOwner("");
    setShowCreatePrompt(true);
  };

  const submitCreateTicket = async () => {
    const secret = redeemSecret || getStoredSecret();
    if (!secret) {
      handleUnauthorized("Not authorized. Please enter validation password.");
      return;
    }

    if (!createCode.trim()) {
      setMessage("Enter a ticket code before creating a ticket");
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const res = await fetch("/api/ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-validate-secret": secret,
        },
        body: JSON.stringify({ ticketCode: createCode.trim(), owner: createOwner.trim() || null }),
      });
      const json = (await res.json()) as TicketMutationResponse;

      if (!res.ok) {
        if (res.status === 403) {
          handleUnauthorized();
          return;
        }
        setMessage(json?.error ?? "Unable to create ticket");
        return;
      }

      setCode(json?.ticket?.ticketCode ?? createCode.trim());
      setShowCreatePrompt(false);
      setCreateCode("");
      setCreateOwner("");
      if (json.ticket) upsertTicketRow(json.ticket, true);
      setCurrentPage(1);
      setMessage("Ticket created");
    } catch (err: unknown) {
      setMessage("Network error: " + getErrorMessage(err));
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const saveOwner = async (ticketId: number) => {
    const secret = redeemSecret || getStoredSecret();
    if (!secret) {
      handleUnauthorized("Not authorized. Please enter validation password.");
      return;
    }

    setRowActionKey(`save-${ticketId}`);
    try {
      const res = await fetch("/api/ticket", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-validate-secret": secret,
        },
        body: JSON.stringify({ id: ticketId, owner: ownerDrafts[ticketId] ?? "" }),
      });
      const json = (await res.json()) as TicketMutationResponse;

      if (!res.ok) {
        if (res.status === 403) {
          handleUnauthorized();
          return;
        }
        setMessage(json?.error ?? "Unable to update name");
        return;
      }

      if (json.ticket) upsertTicketRow(json.ticket);
      setMessage("Ticket name updated");
    } catch (err: unknown) {
      setMessage("Network error: " + getErrorMessage(err));
    } finally {
      setRowActionKey(null);
    }
  };

  const setTicketValidation = async (ticketId: number, validate: boolean) => {
    const secret = redeemSecret || getStoredSecret();
    if (!secret) {
      handleUnauthorized("Not authorized. Please enter validation password.");
      return;
    }

    setRowActionKey(`${validate ? "validate" : "unvalidate"}-${ticketId}`);
    try {
      const res = await fetch("/api/ticket", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-validate-secret": secret,
        },
        body: JSON.stringify({ id: ticketId, validate }),
      });
      const json = (await res.json()) as TicketMutationResponse;

      if (!res.ok) {
        if (res.status === 403) {
          handleUnauthorized();
          return;
        }
        setMessage(json?.error ?? "Unable to update ticket status");
        return;
      }

      if (json.ticket) upsertTicketRow(json.ticket);
      setMessage(validate ? "Ticket validated" : "Ticket marked as un-validated");
    } catch (err: unknown) {
      setMessage("Network error: " + getErrorMessage(err));
    } finally {
      setRowActionKey(null);
    }
  };

  const query = code.trim().toLowerCase();
  const filteredTickets = tickets.filter((ticket) => {
    if (!query) return true;

    const owner = (ticket.owner ?? "").toLowerCase();
    return ticket.ticketCode.toLowerCase().includes(query) || owner.includes(query);
  });
  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pageStart = (page - 1) * PAGE_SIZE;
  const pagedTickets = filteredTickets.slice(pageStart, pageStart + PAGE_SIZE);
  const pageWindowStart = Math.max(1, Math.min(page - 2, Math.max(1, totalPages - 4)));
  const pageWindowEnd = Math.min(totalPages, pageWindowStart + 4);
  const pageNumbers: number[] = [];
  for (let pageNumber = pageWindowStart; pageNumber <= pageWindowEnd; pageNumber += 1) {
    pageNumbers.push(pageNumber);
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar} role="tablist">
        <button className={mode === "manual" ? styles.activeTab : styles.tab} onClick={() => setMode("manual")}>Manual</button>
        <button className={mode === "camera" ? styles.activeTab : styles.tab} onClick={() => setMode("camera")}>Camera</button>
        <button className={mode === "upload" ? styles.activeTab : styles.tab} onClick={() => setMode("upload")}>Upload</button>
      </div>

      {mode === "camera" && (
        <div className={styles.cameraWrap}>
          <div className={styles.videoContainer}>
            <video ref={videoRef} className={styles.video} muted playsInline />
            {scanning && <div className={styles.overlay}>Scanning…</div>}
          </div>

          <div className={styles.controls}>
            <div>
              <label>Camera:</label>
              <select value={selectedDeviceId ?? ""} onChange={(e) => setSelectedDeviceId(e.target.value)}>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>
                ))}
              </select>
            </div>
            <div>
              <button onClick={() => { if (scannerRef.current) stopCamera(); else startCamera(); }}>{scannerRef.current ? "Stop" : "Start"}</button>
              <button onClick={() => { stopCamera(); setMode("manual"); }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {mode === "upload" && (
        <div className={styles.uploadWrap}>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} />
          {previewUrl && (
            <div className={styles.preview}>
              <Image src={previewUrl} alt="preview" width={240} height={240} className={styles.previewImage} unoptimized />
              <div className={styles.previewControls}>
                <button onClick={() => { clearPreview(); setMessage(null); }}>Clear</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.inputRow}>
        <div style={{ flex: 1 }}>
          <label className={styles.label}>Ticket code / table search</label>
          <input className={styles.input} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onKeyDown} placeholder="Scan, paste, or type to search tickets" />
        </div>
        <div className={styles.actions}>
          <button onClick={copyCode} disabled={!code}>Copy</button>
          <button onClick={() => { setCode(""); setTicketInfo(null); setMessage(null); clearPreview(); }}>Clear</button>
        </div>
      </div>

      <div className={styles.buttons}>
        <button className={styles.primary} onClick={() => doValidate(false)} disabled={!isAuthorized || isLoading || !code}>Validate</button>
        <button onClick={() => doValidate(true)} disabled={!isAuthorized || isLoading || !code}>Validate & Attempt Mark</button>
        <button onClick={openCreatePrompt} disabled={!isAuthorized || isLoading}>Create Ticket</button>
        <button onClick={() => void fetchTickets()} disabled={!isAuthorized || isTableLoading}>Refresh Table</button>
        {ticketInfo?.found && ticketInfo?.status !== "REDEEMED" && (
          <button onClick={() => setShowRedeemPrompt(true)} className={styles.warn} disabled={!isAuthorized}>Mark as Redeemed</button>
        )}
        <button onClick={logout} style={{ marginLeft: 8 }}>Logout</button>
      </div>

      {isLoading && <div className={styles.spinner}>Loading…</div>}

      {message && <div className={styles.message}>{message}</div>}

      {ticketInfo && (
        <div className={styles.result}>
          <div className={styles.resultHeader}>
            <strong>Ticket</strong>
            <span className={ticketInfo?.status === "REDEEMED" ? styles.badgeRed : styles.badgeGreen}>{ticketInfo?.status ?? "UNKNOWN"}</span>
          </div>
          <pre className={styles.resultBody}>{JSON.stringify(ticketInfo, null, 2)}</pre>
        </div>
      )}

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Ticket table</h2>
            <p className={styles.sectionHint}>Loaded once locally, then filtered and paginated from the verifier input above.</p>
          </div>
          <span className={styles.tableCount}>{filteredTickets.length} of {tickets.length} ticket{tickets.length === 1 ? "" : "s"}</span>
        </div>

        {isTableLoading && <div className={styles.spinner}>Loading tickets…</div>}
        {!isTableLoading && tableMessage && <div className={styles.tableMessage}>{tableMessage}</div>}
        {!isTableLoading && !tableMessage && tickets.length > 0 && filteredTickets.length === 0 && (
          <div className={styles.tableMessage}>No tickets match the current search.</div>
        )}

        {!isTableLoading && filteredTickets.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ticket code</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedTickets.map((ticket) => {
                  const ownerValue = ownerDrafts[ticket.id] ?? "";
                  const saveDisabled = rowActionKey !== null || ownerValue.trim() === (ticket.owner ?? "").trim();
                  const toggleKey = `${ticket.validate ? "unvalidate" : "validate"}-${ticket.id}`;
                  return (
                    <tr key={ticket.id}>
                      <td>
                        <button className={styles.linkButton} onClick={() => setCode(ticket.ticketCode)}>{ticket.ticketCode}</button>
                      </td>
                      <td>
                        <div className={styles.ownerEditor}>
                          <input
                            className={styles.tableInput}
                            value={ownerValue}
                            onChange={(e) => setOwnerDrafts((current) => ({ ...current, [ticket.id]: e.target.value }))}
                            placeholder="Ticket owner"
                          />
                          <button onClick={() => saveOwner(ticket.id)} disabled={saveDisabled}>Save</button>
                        </div>
                      </td>
                      <td>
                        <span className={ticket.validate ? styles.badgeRed : styles.badgeGreen}>{ticket.status}</span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button onClick={() => doValidate(false, ticket.ticketCode)} disabled={rowActionKey !== null}>Validate code</button>
                          <button
                            className={ticket.validate ? "" : styles.warn}
                            onClick={() => setTicketValidation(ticket.id, !ticket.validate)}
                            disabled={rowActionKey !== null}
                          >
                            {rowActionKey === toggleKey ? "Saving…" : ticket.validate ? "Un-validate" : "Validate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className={styles.pagination}>
              <div className={styles.paginationSummary}>
                Showing {pageStart + 1} to {Math.min(pageStart + PAGE_SIZE, filteredTickets.length)} of {filteredTickets.length}
              </div>
              <div className={styles.paginationControls}>
                <button onClick={() => setCurrentPage(page - 1)} disabled={page <= 1}>Previous</button>
                {pageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    className={pageNumber === page ? styles.activePageButton : undefined}
                    onClick={() => setCurrentPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button onClick={() => setCurrentPage(page + 1)} disabled={page >= totalPages}>Next</button>
              </div>
            </div>
          </div>
        )}
      </section>

      {showRedeemPrompt && (
        <div className={styles.modal} role="dialog">
          <div className={styles.modalContent}>
            <h3>Confirm Redeem</h3>
            <p>Enter admin secret to mark ticket as redeemed.</p>
            <input className={styles.modalInput} type="password" value={redeemSecret} onChange={(e) => setRedeemSecret(e.target.value)} onKeyDown={(e) => { if ((e as React.KeyboardEvent<HTMLInputElement>).key === "Enter") confirmRedeem(); }} />
            <div style={{ marginTop: 8 }}>
              <button onClick={confirmRedeem} disabled={!redeemSecret}>Confirm</button>
              <button onClick={() => setShowRedeemPrompt(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showCreatePrompt && (
        <div className={styles.modal} role="dialog">
          <div className={styles.modalContent}>
            <h3>Create Ticket</h3>
            <p>Add a new ticket code and owner name.</p>
            <div className={styles.modalForm}>
              <div>
                <label className={styles.label}>Ticket code</label>
                <input className={styles.modalInput} value={createCode} onChange={(e) => setCreateCode(e.target.value)} />
              </div>
              <div>
                <label className={styles.label}>Owner name</label>
                <input className={styles.modalInput} value={createOwner} onChange={(e) => setCreateOwner(e.target.value)} />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button onClick={submitCreateTicket} disabled={isSubmittingCreate || !createCode.trim()}>{isSubmittingCreate ? "Creating…" : "Create"}</button>
              <button onClick={() => setShowCreatePrompt(false)} disabled={isSubmittingCreate}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showAuthPrompt && (
        <div className={styles.modal} role="dialog">
          <div className={styles.modalContent}>
            <h3>Verifier Login</h3>
            <p>Enter validation password to enable verification features.</p>
            <input className={styles.modalInput} type="password" value={authInput} onChange={(e) => setAuthInput(e.target.value)} onKeyDown={(e) => { if ((e as React.KeyboardEvent<HTMLInputElement>).key === "Enter") submitAuth(); }} />
            <div className={styles.modalActions}>
              <button onClick={submitAuth} disabled={!authInput || isLoading}>Login</button>
              <button onClick={() => setShowAuthPrompt(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
