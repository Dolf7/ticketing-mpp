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
      const res = await QrScanner.scanImage(f, { returnDetailedScanResult: false });
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
    setIsLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const res = await fetch("/api/ticket/validate", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: code.trim(), markUsed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.error ?? "Validation error");
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
    setIsLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", "x-validate-secret": redeemSecret };
      const res = await fetch("/api/ticket/validate", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: code.trim(), markUsed: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.error ?? "Redeem error");
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
        <button className={styles.primary} onClick={() => doValidate(false)} disabled={isLoading || !code}>Validate</button>
        <button onClick={() => doValidate(true)} disabled={isLoading || !code}>Validate & Attempt Mark</button>
        {ticketInfo?.found && ticketInfo?.status !== "REDEEMED" && (
          <button onClick={() => setShowRedeemPrompt(true)} className={styles.warn}>Mark as Redeemed</button>
        )}
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
            <input type="password" value={redeemSecret} onChange={(e) => setRedeemSecret(e.target.value)} />
            <div style={{ marginTop: 8 }}>
              <button onClick={confirmRedeem} disabled={!redeemSecret}>Confirm</button>
              <button onClick={() => setShowRedeemPrompt(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
