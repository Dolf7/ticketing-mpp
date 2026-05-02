"use client";

import React, { useEffect, useRef, useState } from "react";
// @ts-ignore
import QrScanner from "qr-scanner";
import styles from "./TicketVerifier.module.css";

export default function TicketVerifier() {
  const [mode, setMode] = useState<"manual" | "camera" | "upload">("manual");
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ticketInfo, setTicketInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showRedeemPrompt, setShowRedeemPrompt] = useState(false);
  const [redeemSecret, setRedeemSecret] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(true);
  const [authInput, setAuthInput] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      QrScanner.WORKER_PATH = "/qr-scanner-worker.min.js";
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
        } catch (err) {
          setShowAuthPrompt(true);
        }
      } else {
        setShowAuthPrompt(true);
      }
    };
    initAuth();
  }, []);

  const discoverDevices = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === "videoinput");
      setDevices(cams);
      if (!selectedDeviceId && cams.length > 0) setSelectedDeviceId(cams[0].deviceId);
    } catch (err) {
      // ignore
    }
  };

  const startCamera = async () => {
    if (!videoRef.current) return;
    stopCamera();
    try {
      setScanning(true);
      const options: Record<string, unknown> = { returnDetailedScanResult: false, highlightScanRegion: true, highlightCodeOutline: true };
      if (selectedDeviceId) options["preferredCamera"] = selectedDeviceId;
      const scanner = new QrScanner(videoRef.current, (result: any) => {
        // qr-scanner may return a string or a detailed result object depending on options
        const text = typeof result === "string"
          ? result
          : result?.data ?? result?.rawValue ?? (typeof result === "object" ? JSON.stringify(result) : String(result));
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
    } catch (err) {
      console.error(err);
      setMessage("Camera error: " + String(err));
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
      // call scanImage without the options object to satisfy TypeScript signature
      const res = await (QrScanner as any).scanImage(f);
      if (res) {
        const text = typeof res === "string"
          ? res
          : res?.data ?? res?.rawValue ?? (typeof res === "object" ? JSON.stringify(res) : String(res));
        setCode(text);
        setMessage("QR decoded from image");
      } else {
        setMessage("No QR code found in image");
      }
    } catch (err: any) {
      setMessage("Error scanning image: " + (err?.message ?? String(err)));
    }
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const doValidate = async (markUsed = false) => {
    setMessage(null);
    setTicketInfo(null);
    if (!code || code.trim() === "") {
      setMessage("Please provide a code first");
      return;
    }
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
        body: JSON.stringify({ code: code.trim(), markUsed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.error ?? "Validation error");
        if (res.status === 403) {
          setIsAuthorized(false);
          sessionStorage.removeItem("validateSecret");
          setShowAuthPrompt(true);
        }
      } else {
        setTicketInfo(json);
        setMessage(json?.found ? "Ticket found" : "Ticket not found");
      }
    } catch (err: any) {
      setMessage("Network error: " + (err?.message ?? String(err)));
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
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.error ?? "Redeem error");
        if (res.status === 403) {
          setIsAuthorized(false);
          sessionStorage.removeItem("validateSecret");
          setShowAuthPrompt(true);
        }
      } else {
        setTicketInfo(json);
        setMessage("Redeemed");
        setShowRedeemPrompt(false);
      }
    } catch (err: any) {
      setMessage("Network error: " + (err?.message ?? String(err)));
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
        const json = await res.json();
        setMessage(json?.error ?? "Unauthorized");
        setIsAuthorized(false);
      } else {
        sessionStorage.setItem("validateSecret", authInput.trim());
        setRedeemSecret(authInput.trim());
        setIsAuthorized(true);
        setShowAuthPrompt(false);
        setMessage("Authorized");
      }
    } catch (err: any) {
      setMessage("Network error: " + (err?.message ?? String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem("validateSecret");
    setRedeemSecret("");
    setIsAuthorized(false);
    setShowAuthPrompt(true);
    setMessage("Logged out");
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Code copied to clipboard");
    } catch (err) {
      setMessage("Copy failed");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") doValidate(false);
  };

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
              <img src={previewUrl} alt="preview" />
              <div className={styles.previewControls}>
                <button onClick={() => { clearPreview(); setMessage(null); }}>Clear</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.inputRow}>
        <div style={{ flex: 1 }}>
          <label className={styles.label}>Ticket code</label>
          <input className={styles.input} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onKeyDown} />
        </div>
        <div className={styles.actions}>
          <button onClick={copyCode} disabled={!code}>Copy</button>
          <button onClick={() => { setCode(""); setTicketInfo(null); setMessage(null); clearPreview(); }}>Clear</button>
        </div>
      </div>

      <div className={styles.buttons}>
        <button className={styles.primary} onClick={() => doValidate(false)} disabled={!isAuthorized || isLoading || !code}>Validate</button>
        <button onClick={() => doValidate(true)} disabled={!isAuthorized || isLoading || !code}>Validate & Attempt Mark</button>
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

      {showAuthPrompt && (
        <div className={styles.modal} role="dialog">
          <div className={styles.modalContent}>
            <h3>Verifier Login</h3>
            <p>Enter validation password to enable verification features.</p>
            <input className={styles.modalInput} type="password" value={authInput} onChange={(e) => setAuthInput(e.target.value)} onKeyDown={(e) => { if ((e as React.KeyboardEvent<HTMLInputElement>).key === "Enter") submitAuth(); }} />
            <div style={{ marginTop: 8 }}>
              <button onClick={submitAuth} disabled={!authInput || isLoading}>Login</button>
              <button onClick={() => setShowAuthPrompt(false)} style={{ marginLeft: 8 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
