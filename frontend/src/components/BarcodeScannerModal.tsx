import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';

export function BarcodeScannerModal({
  onDetect,
  onClose,
}: {
  onDetect: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(true);
  const [cameraError, setCameraError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    activeRef.current = true;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const reader = new BrowserMultiFormatReader();

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((stream) => {
        if (!activeRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        video.srcObject = stream;

        video.addEventListener('loadedmetadata', () => {
          void video.play().catch(() => {/* ignore */});
        });

        video.addEventListener('playing', () => {
          if (!activeRef.current) return;
          setReady(true);
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          const ctx = canvas.getContext('2d')!;

          const tick = () => {
            if (!activeRef.current) return;
            if (video.readyState >= video.HAVE_ENOUGH_DATA) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              try {
                const result = reader.decodeFromCanvas(canvas);
                if (activeRef.current) {
                  activeRef.current = false;
                  onDetect(result.getText());
                  return;
                }
              } catch (e) {
                if (!(e instanceof NotFoundException)) {
                  // unexpected error — keep scanning
                }
              }
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        });
      })
      .catch((err: unknown) => {
        setCameraError(err instanceof Error ? err.message : 'Camera access denied.');
      });

    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [onDetect]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-sm overflow-hidden rounded-t-2xl bg-black sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-bold text-white">Scan barcode</p>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
            onClick={onClose}
            type="button"
            aria-label="Close scanner"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {cameraError ? (
          <div className="px-4 pb-8 text-center">
            <p className="font-bold text-red-400">Camera error</p>
            <p className="mt-1 text-sm text-zinc-400">{cameraError}</p>
            <button className="btn btn-primary mt-5" onClick={onClose} type="button">
              Close
            </button>
          </div>
        ) : (
          <div className="relative bg-black" style={{ minHeight: '240px' }}>
            {/* Hidden canvas for decoding */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Visible video */}
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />

            {/* Viewfinder */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-28 w-72">
                <div className="absolute -inset-[9999px] bg-black/45" />
                <div className="absolute inset-0 bg-transparent" />
                <span className="absolute left-0 top-0 h-6 w-6 rounded-tl border-l-2 border-t-2 border-mint" />
                <span className="absolute right-0 top-0 h-6 w-6 rounded-tr border-r-2 border-t-2 border-mint" />
                <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl border-b-2 border-l-2 border-mint" />
                <span className="absolute bottom-0 right-0 h-6 w-6 rounded-br border-b-2 border-r-2 border-mint" />
                {ready && (
                  <div className="barcode-scan-line absolute inset-x-1 top-0 h-0.5 rounded-full bg-mint/80 shadow-[0_0_6px_1px_rgba(69,208,158,0.6)]" />
                )}
              </div>
            </div>

            <p className="absolute bottom-3 left-0 right-0 text-center text-xs font-semibold text-white/60">
              Align barcode within the frame
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
