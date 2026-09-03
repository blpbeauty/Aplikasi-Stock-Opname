"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { playScanSuccessSound } from "@/lib/sound";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  active: boolean;
}

// Check if native BarcodeDetector is available (Chrome Android 83+, Chrome Desktop 88+)
const hasNativeBarcodeDetector = typeof window !== "undefined" && "BarcodeDetector" in window;

export default function BarcodeScanner({ onScan, active }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [scanMode, setScanMode] = useState<"native" | "lib">("native");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const lastScanRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);
  const activeRef = useRef(active);
  // Fallback: html5-qrcode refs
  const libScannerRef = useRef<any>(null);
  const libContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { activeRef.current = active; }, [active]);

  const handleDetected = useCallback((code: string) => {
    const now = Date.now();
    if (code === lastScanRef.current && now - lastScanTimeRef.current < 1500) return;
    lastScanRef.current = code;
    lastScanTimeRef.current = now;
    playScanSuccessSound();
    onScanRef.current(code);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // NATIVE MODE: Direct getUserMedia + BarcodeDetector + rAF
  // This is how AppSheet works — zero library overhead, GPU-accelerated
  // ═══════════════════════════════════════════════════════════════
  const startNative = useCallback(async () => {
    try {
      // Create BarcodeDetector with all formats
      const BD = (window as any).BarcodeDetector;
      const formats = await BD.getSupportedFormats();
      detectorRef.current = new BD({ formats });

      // Open camera with optimal constraints for scanning
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // @ts-ignore — advanced constraints for Android
          focusMode: { ideal: "continuous" },
          frameRate: { ideal: 60, min: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;

      // Apply continuous autofocus
      const track = stream.getVideoTracks()[0];
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: "continuous" } as any],
        });
      } catch { /* focusMode may not be supported */ }

      // Check torch
      try {
        const caps = track.getCapabilities() as any;
        if (caps?.torch) setTorchSupported(true);
      } catch { /* torch check */ }

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraReady(true);
      setError(null);

      // Start scanning loop — runs at display refresh rate (60fps)
      const scanLoop = async () => {
        if (!activeRef.current || !videoRef.current || !detectorRef.current) return;
        const video = videoRef.current;
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA
          try {
            const barcodes = await detectorRef.current.detect(video);
            if (barcodes.length > 0) {
              handleDetected(barcodes[0].rawValue);
            }
          } catch {
            // detect can fail on some frames, ignore
          }
        }
        rafRef.current = requestAnimationFrame(scanLoop);
      };
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch (err: any) {
      throw err; // Let caller handle
    }
  }, [handleDetected]);

  const stopNative = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    detectorRef.current = null;
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // FALLBACK MODE: html5-qrcode (for iOS/Safari/older browsers)
  // ═══════════════════════════════════════════════════════════════
  const startLibFallback = useCallback(async () => {
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

      if (libScannerRef.current) {
        try { await libScannerRef.current.stop(); libScannerRef.current.clear(); } catch {}
        libScannerRef.current = null;
      }

      const formatsToSupport = [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.AZTEC,
        Html5QrcodeSupportedFormats.PDF_417,
      ];

      const scanner = new Html5Qrcode("lib-scanner-container", {
        formatsToSupport,
        verbose: false,
      });
      libScannerRef.current = scanner;

      const containerW = libContainerRef.current?.clientWidth || 320;
      const qrboxSize = Math.floor(Math.min(containerW, 400) * 0.8);

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 30,
          qrbox: { width: qrboxSize, height: qrboxSize },
          aspectRatio: 1.0,
          disableFlip: true,
        },
        (decodedText: string) => handleDetected(decodedText),
        () => {}
      );

      setCameraReady(true);
      setError(null);

      // Check torch for fallback
      try {
        const videoEl = libContainerRef.current?.querySelector("video");
        if (videoEl?.srcObject) {
          const vTrack = (videoEl.srcObject as MediaStream).getVideoTracks()[0];
          const caps = vTrack?.getCapabilities?.() as any;
          if (caps?.torch) setTorchSupported(true);
        }
      } catch {}
    } catch (err: any) {
      throw err;
    }
  }, [handleDetected]);

  const stopLibFallback = useCallback(async () => {
    if (libScannerRef.current) {
      try { await libScannerRef.current.stop(); libScannerRef.current.clear(); } catch {}
      libScannerRef.current = null;
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════
  const startScanner = useCallback(async () => {
    try {
      if (hasNativeBarcodeDetector) {
        setScanMode("native");
        await startNative();
      } else {
        setScanMode("lib");
        await startLibFallback();
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setError("Izin kamera ditolak. Silakan izinkan akses kamera di pengaturan browser.");
      } else if (msg.includes("NotFoundError") || msg.includes("Requested device not found")) {
        setError("Kamera tidak ditemukan.");
      } else if (msg.includes("NotReadableError") || msg.includes("Could not start")) {
        setError("Kamera sedang digunakan aplikasi lain.");
      } else {
        setError("Gagal mengakses kamera: " + msg);
      }
      setCameraReady(false);
    }
  }, [startNative, startLibFallback]);

  const stopScanner = useCallback(async () => {
    stopNative();
    await stopLibFallback();
    setCameraReady(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, [stopNative, stopLibFallback]);

  const toggleTorch = useCallback(async () => {
    try {
      let track: MediaStreamTrack | null = null;
      if (streamRef.current) {
        track = streamRef.current.getVideoTracks()[0];
      } else {
        // Fallback mode — get track from video element in lib container
        const videoEl = libContainerRef.current?.querySelector("video");
        if (videoEl?.srcObject) {
          track = (videoEl.srcObject as MediaStream).getVideoTracks()[0];
        }
      }
      if (track) {
        const newVal = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: newVal } as any] });
        setTorchOn(newVal);
      }
    } catch {}
  }, [torchOn]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    if (active) {
      const timer = setTimeout(() => startScanner(), 50); // Near-instant start
      return () => { clearTimeout(timer); stopScanner(); };
    } else {
      stopScanner();
    }
  }, [active, mounted, startScanner, stopScanner]);

  useEffect(() => { return () => { stopScanner(); }; }, [stopScanner]);

  if (!mounted || !active) {
    return (
      <div className="w-full h-72 bg-gray-900 rounded-xl flex items-center justify-center">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-2 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <p className="text-gray-400 text-sm">Kamera tidak aktif</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl overflow-hidden relative bg-black">
      {error ? (
        <div className="w-full h-72 bg-gray-900 rounded-xl flex items-center justify-center">
          <div className="text-center text-white p-4">
            <svg className="w-10 h-10 mx-auto mb-2 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
            <p className="text-sm mb-3">{error}</p>
            <button
              onClick={() => { setError(null); startScanner(); }}
              className="px-5 py-2 bg-white text-gray-800 rounded-lg text-sm font-semibold active:scale-95 transition"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* NATIVE MODE: direct video element */}
          {scanMode === "native" && (
            <video
              ref={videoRef}
              className="w-full rounded-xl"
              style={{ minHeight: "300px", objectFit: "cover" }}
              autoPlay
              playsInline
              muted
            />
          )}

          {/* FALLBACK MODE: html5-qrcode container */}
          {scanMode === "lib" && (
            <div
              id="lib-scanner-container"
              ref={libContainerRef}
              className="w-full bg-black"
              style={{ minHeight: "300px" }}
            />
          )}

          {/* Hidden canvas for native mode frame capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Loading overlay */}
          {!cameraReady && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center rounded-xl">
              <div className="text-center">
                <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-gray-300 text-sm">Membuka kamera...</p>
              </div>
            </div>
          )}

          {/* Scanner overlay — crosshair */}
          {cameraReady && scanMode === "native" && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* Corner brackets */}
              <div className="relative" style={{ width: "70%", height: "55%", maxWidth: "300px", maxHeight: "250px" }}>
                {/* Top-left */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-amber-400 rounded-tl-md" />
                {/* Top-right */}
                <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-amber-400 rounded-tr-md" />
                {/* Bottom-left */}
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-amber-400 rounded-bl-md" />
                {/* Bottom-right */}
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-amber-400 rounded-br-md" />
                {/* Scan line animation */}
                <div className="absolute left-2 right-2 h-0.5 bg-amber-400/80 animate-pulse shadow-[0_0_8px_rgba(212,155,75,0.8)]" style={{ top: "50%" }} />
              </div>
            </div>
          )}

          {cameraReady && (
            <>
              {/* Torch toggle */}
              {torchSupported && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`absolute top-2 right-2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition ${
                    torchOn ? "bg-yellow-400 text-gray-900" : "bg-black/50 text-white"
                  }`}
                  title={torchOn ? "Matikan flash" : "Nyalakan flash"}
                >
                  {torchOn ? "🔦" : "💡"}
                </button>
              )}
              <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
                <span className="bg-black/60 text-white text-[11px] px-3 py-1 rounded-full backdrop-blur-sm">
                  {scanMode === "native" ? "⚡ Native Scanner" : "📷 Scanner"} — Arahkan ke QR / Barcode
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
