import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { Barcode, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type BarcodeScannerButtonProps = {
  onScanSuccess?: (value: string) => void;
  onScanError?: (error: Error) => void;
  onDetect?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  label?: string;
  size?: 'field' | 'compact';
};

type NativeDetectedBarcode = {
  rawValue?: string;
};

type NativeBarcodeDetector = {
  detect: (source: CanvasImageSource) => Promise<NativeDetectedBarcode[]>;
};

type NativeBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

type WindowWithBarcodeDetector = Window &
  typeof globalThis & {
    BarcodeDetector?: NativeBarcodeDetectorConstructor;
  };

const barcodeHints = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
    ],
  ],
  [DecodeHintType.TRY_HARDER, true],
]);

const environmentCameraConstraints: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: 'environment',
  },
};

const fallbackCameraConstraints: MediaStreamConstraints = {
  audio: false,
  video: true,
};

const logPrefix = '[BarcodeScanner]';
const scanAngles = [0, -6, 6, -12, 12, -18, 18];
const scanSources = ['center', 'wide', 'full'] as const;
const scanCandidates = scanSources.flatMap((source) =>
  scanAngles.flatMap((angle) => [
    { source, angle, enhanced: false },
    { source, angle, enhanced: true },
  ]),
);
const nativeBarcodeFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
const safeNativeBarcodeFormats = ['ean_13', 'ean_8', 'code_128'];

export function BarcodeScannerButton({
  onScanSuccess,
  onScanError,
  onDetect,
  className = '',
  disabled = false,
  label = 'Scan barcode',
  size = 'field',
}: BarcodeScannerButtonProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [previewReady, setPreviewReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const scanTimeoutRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    console.info(`${logPrefix} stopCamera called`, {
      hasControls: Boolean(controlsRef.current),
      hasStream: Boolean(streamRef.current),
      tracks: streamRef.current?.getTracks().map((track) => ({
        kind: track.kind,
        label: track.label,
        readyState: track.readyState,
        muted: track.muted,
      })),
    });

    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    if (scanTimeoutRef.current !== null) {
      window.clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    controlsRef.current?.stop();
    controlsRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const preview = videoRef.current;
    if (preview) {
      const stream = preview.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      preview.pause();
      preview.srcObject = null;
    }
    setPreviewReady(false);
  }, []);

  const closeScanner = useCallback(() => {
    stopCamera();
    setOpen(false);
  }, [stopCamera]);

  const reportSuccess = useCallback(
    (value: string) => {
      onScanSuccess?.(value);
      onDetect?.(value);
    },
    [onDetect, onScanSuccess],
  );

  const reportError = useCallback(
    (error: unknown) => {
      onScanError?.(toError(error));
    },
    [onScanError],
  );

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    const reader = new BrowserMultiFormatReader(barcodeHints, {
      delayBetweenScanAttempts: 180,
      delayBetweenScanSuccess: 250,
      tryPlayVideoTimeout: 6000,
    });

    const fail = (error: unknown) => {
      if (cancelled) return;
      cancelled = true;
      stopCamera();
      const normalizedError = toError(error);
      setStatus(normalizedError.message);
      console.error(`${logPrefix} scanner failed`, normalizedError);
      reportError(normalizedError);
    };

    const complete = (value: string, controls?: IScannerControls) => {
      if (cancelled) return;
      cancelled = true;
      controls?.stop();
      stopCamera();
      setOpen(false);
      reportSuccess(value);
    };

    const startScanner = async () => {
      try {
        console.info(`${logPrefix} opening`, {
          isSecureContext: window.isSecureContext,
          hasMediaDevices: Boolean(navigator.mediaDevices),
          hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
          userAgent: navigator.userAgent,
        });

        if (!window.isSecureContext) {
          throw new Error('Camera scanning requires HTTPS or localhost.');
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not available on this device.');
        }

        const video = videoRef.current;
        if (!video) {
          throw new Error('Camera preview is unavailable.');
        }

        setStatus('Opening camera...');
        console.info(`${logPrefix} requesting getUserMedia`, environmentCameraConstraints);
        const stream = await openCameraStream();
        console.info(`${logPrefix} getUserMedia resolved`, {
          active: stream.active,
          tracks: stream.getTracks().map((track) => ({
            kind: track.kind,
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            settings: track.getSettings?.(),
          })),
        });
        attachTrackDebugLogs(stream);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        video.srcObject = stream;
        video.muted = true;
        video.setAttribute('muted', 'true');
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.setAttribute('autoplay', 'true');

        setStatus('Starting preview...');
        await waitForVideoPlayback(video);
        console.info(`${logPrefix} preview playing`, getVideoDebugState(video));
        if (cancelled) return;

        setPreviewReady(true);
        setStatus('Scanning...');
        startCanvasPreview(video, canvasRef.current, previewFrameRef);

        console.info(`${logPrefix} starting robust ZXing scan`, {
          formats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128'],
        });
        const nativeDetector = createNativeBarcodeDetector();
        let controls: IScannerControls | undefined;
        controls = startRobustBarcodeScan(reader, nativeDetector, video, scanTimeoutRef, (value) => {
          complete(value, controls);
        });

        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
          console.info(`${logPrefix} robust ZXing scan controls ready`);
          for (const track of stream.getVideoTracks()) {
            track.applyConstraints?.({
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            }).catch(() => {
              // Some iOS/Safari cameras do not expose focus constraints.
            });
          }
        }
      } catch (error) {
        fail(error);
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, reportError, reportSuccess, stopCamera]);

  const overlay = open ? (
    <div className="fixed inset-0 z-[1200] bg-black text-white">
      <video
        ref={videoRef}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full bg-transparent object-cover opacity-0"
        muted
        playsInline
        autoPlay
        style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 h-full w-full bg-black object-cover"
      />
      <div className={`absolute inset-0 z-[1] bg-black transition-opacity ${previewReady ? 'opacity-0' : 'opacity-30'}`} />

      <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-3 p-4">
        <p className="text-sm font-black uppercase tracking-wide text-white/80">Scanning</p>
        <button
          className="btn h-10 w-10 bg-white/15 px-0 text-white hover:bg-white/25"
          type="button"
          onClick={closeScanner}
          aria-label="Close scanner"
          title="Close"
        >
          <X size={20} />
        </button>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
        <div className="relative aspect-[1.65/1] w-full max-w-md rounded-2xl border-2 border-white/85 shadow-[0_0_0_999px_rgba(0,0,0,0.36)]">
          <span className="absolute -left-0.5 -top-0.5 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-mint" />
          <span className="absolute -right-0.5 -top-0.5 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-mint" />
          <span className="absolute -bottom-0.5 -left-0.5 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-mint" />
          <span className="absolute -bottom-0.5 -right-0.5 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-mint" />
          <span className="barcode-scan-line absolute left-4 right-4 top-5 h-0.5 rounded-full bg-mint shadow-[0_0_18px_rgba(69,208,158,0.9)]" />
        </div>
      </div>

      {!previewReady ? (
        <div className="absolute inset-x-6 bottom-10 z-20 rounded-lg bg-white/10 px-4 py-3 text-center text-sm font-bold text-white/85 backdrop-blur">
          {status || 'Preparing camera...'}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <button
        className={`btn btn-ghost shrink-0 px-0 ${
          size === 'compact' ? 'h-10 min-h-10 w-10' : 'h-11 min-h-11 w-11'
        } ${className}`}
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Barcode size={18} />
      </button>

      {overlay && typeof document !== 'undefined' ? createPortal(overlay, document.body) : null}
    </>
  );
}

function toError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : 'Barcode scanner failed.');
}

async function waitForVideoPlayback(video: HTMLVideoElement) {
  console.info(`${logPrefix} calling video.play`, getVideoDebugState(video));
  const playPromise = video.play();

  await new Promise<void>((resolve, reject) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      console.info(`${logPrefix} video already has current data`, getVideoDebugState(video));
      resolve();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      cleanup();
      console.error(`${logPrefix} preview timeout`, getVideoDebugState(video));
      reject(new Error('Camera preview did not start.'));
    }, 7000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('canplay', onReady);
    };

    const onReady = () => {
      cleanup();
      console.info(`${logPrefix} video ready event`, getVideoDebugState(video));
      resolve();
    };

    video.addEventListener('loadedmetadata', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
  });

  await playPromise;
}

function getVideoDebugState(video: HTMLVideoElement) {
  return {
    readyState: video.readyState,
    paused: video.paused,
    ended: video.ended,
    currentTime: video.currentTime,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    hasSource: Boolean(video.srcObject),
  };
}

function isExpectedScanMiss(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  const constructorName =
    typeof error === 'object' && error !== null && 'constructor' in error
      ? (error.constructor as { name?: string }).name ?? ''
      : '';
  const message = error instanceof Error ? error.message : String(error);
  return [name, constructorName, message].some((part) =>
    ['NotFoundException', 'NotFoundException2', 'ChecksumException', 'FormatException'].some((expected) =>
      part.includes(expected),
    ),
  );
}

function startRobustBarcodeScan(
  reader: BrowserMultiFormatReader,
  nativeDetector: NativeBarcodeDetector | null,
  video: HTMLVideoElement,
  timeoutRef: { current: number | null },
  onDetected: (value: string) => void,
): IScannerControls {
  let stopped = false;
  let attempts = 0;
  let candidateIndex = 0;

  const sourceCanvas = document.createElement('canvas');
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const candidateCanvas = document.createElement('canvas');
  const candidateContext = candidateCanvas.getContext('2d', { willReadFrequently: true });

  const stop = () => {
    stopped = true;
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const scheduleNext = (delay = 70) => {
    timeoutRef.current = window.setTimeout(scanOnce, delay);
  };

  const scanOnce = async () => {
    if (stopped) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!sourceContext || !candidateContext || width <= 0 || height <= 0) {
      scheduleNext();
      return;
    }

    if (sourceCanvas.width !== width || sourceCanvas.height !== height) {
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      console.info(`${logPrefix} scanner source size`, { width, height });
    }

    sourceContext.drawImage(video, 0, 0, width, height);

    const candidate = scanCandidates[candidateIndex];
    candidateIndex = (candidateIndex + 1) % scanCandidates.length;

    const crop = getScanCrop(candidate.source, width, height);
    drawCandidate(sourceCanvas, candidateCanvas, candidateContext, crop, candidate.angle, candidate.enhanced);

    const nativeValue = await detectNativeBarcode(nativeDetector, candidateCanvas);
    if (stopped) return;
    if (nativeValue) {
      console.info(`${logPrefix} native barcode detected`, {
        value: nativeValue,
        source: candidate.source,
        angle: candidate.angle,
        enhanced: candidate.enhanced,
        attempts,
      });
      stop();
      onDetected(nativeValue);
      return;
    }

    try {
      const result = reader.decodeFromCanvas(candidateCanvas);
      const value = result.getText();
      if (value) {
        console.info(`${logPrefix} barcode detected`, {
          value,
          format: result.getBarcodeFormat?.(),
          source: candidate.source,
          angle: candidate.angle,
          enhanced: candidate.enhanced,
          attempts,
        });
        stop();
        onDetected(value);
        return;
      }
    } catch (error) {
      if (!isExpectedScanMiss(error)) {
        console.warn(`${logPrefix} scan candidate error`, {
          source: candidate.source,
          angle: candidate.angle,
          enhanced: candidate.enhanced,
          error,
        });
      }
    }

    attempts += 1;
    if (attempts % scanCandidates.length === 0) {
      console.info(`${logPrefix} still scanning`, {
        attempts,
        rounds: Math.round(attempts / scanCandidates.length),
      });
    }
    scheduleNext(candidate.enhanced ? 90 : 60);
  };

  scanOnce();

  return { stop };
}

function getScanCrop(source: (typeof scanSources)[number], width: number, height: number) {
  if (source === 'full') {
    return { x: 0, y: 0, width, height };
  }

  const cropWidth = Math.round(width * 0.96);
  const cropHeight = Math.round(height * (source === 'wide' ? 0.75 : 0.55));
  return {
    x: Math.round((width - cropWidth) / 2),
    y: Math.round((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}

function drawCandidate(
  sourceCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  targetContext: CanvasRenderingContext2D,
  crop: { x: number; y: number; width: number; height: number },
  angle: number,
  enhanced: boolean,
) {
  const scale = enhanced ? 1.6 : 1;
  targetCanvas.width = Math.round(crop.width * scale);
  targetCanvas.height = Math.round(crop.height * scale);
  targetContext.save();
  targetContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetContext.fillStyle = '#fff';
  targetContext.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetContext.translate(targetCanvas.width / 2, targetCanvas.height / 2);
  targetContext.rotate((angle * Math.PI) / 180);
  if (enhanced) {
    targetContext.filter = 'grayscale(1) contrast(1.8) brightness(1.08)';
    targetContext.imageSmoothingEnabled = false;
  } else {
    targetContext.filter = 'none';
    targetContext.imageSmoothingEnabled = true;
  }
  targetContext.drawImage(
    sourceCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -targetCanvas.width / 2,
    -targetCanvas.height / 2,
    targetCanvas.width,
    targetCanvas.height,
  );
  targetContext.restore();
}

function createNativeBarcodeDetector() {
  const Detector = (window as WindowWithBarcodeDetector).BarcodeDetector;
  if (!Detector) return null;

  try {
    const detector = new Detector({ formats: nativeBarcodeFormats });
    console.info(`${logPrefix} native BarcodeDetector enabled`, { formats: nativeBarcodeFormats });
    return detector;
  } catch (error) {
    try {
      const detector = new Detector({ formats: safeNativeBarcodeFormats });
      console.info(`${logPrefix} native BarcodeDetector enabled`, { formats: safeNativeBarcodeFormats });
      return detector;
    } catch {
      console.warn(`${logPrefix} native BarcodeDetector unavailable`, error);
      return null;
    }
  }
}

async function detectNativeBarcode(detector: NativeBarcodeDetector | null, canvas: HTMLCanvasElement) {
  if (!detector) return null;

  try {
    const results = await detector.detect(canvas);
    return results.find((result) => result.rawValue)?.rawValue ?? null;
  } catch {
    return null;
  }
}

async function openCameraStream() {
  try {
    return await navigator.mediaDevices.getUserMedia(environmentCameraConstraints);
  } catch (error) {
    console.warn(`${logPrefix} environment camera failed, falling back to default camera`, error);
    return navigator.mediaDevices.getUserMedia(fallbackCameraConstraints);
  }
}

function attachTrackDebugLogs(stream: MediaStream) {
  for (const track of stream.getVideoTracks()) {
    console.info(`${logPrefix} video track state`, {
      label: track.label,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      settings: track.getSettings?.(),
    });

    track.onmute = () => {
      console.warn(`${logPrefix} video track muted`, {
        label: track.label,
        readyState: track.readyState,
        settings: track.getSettings?.(),
      });
    };
    track.onunmute = () => {
      console.info(`${logPrefix} video track unmuted`, {
        label: track.label,
        readyState: track.readyState,
        settings: track.getSettings?.(),
      });
    };
    track.onended = () => {
      console.warn(`${logPrefix} video track ended`, {
        label: track.label,
        readyState: track.readyState,
      });
    };
  }
}

function startCanvasPreview(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement | null,
  frameRef: { current: number | null },
) {
  if (!canvas) {
    console.warn(`${logPrefix} canvas preview unavailable`);
    return;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    console.warn(`${logPrefix} canvas context unavailable`);
    return;
  }

  const draw = () => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        console.info(`${logPrefix} canvas preview size`, {
          width: canvas.width,
          height: canvas.height,
        });
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    frameRef.current = window.requestAnimationFrame(draw);
  };

  if (frameRef.current !== null) {
    window.cancelAnimationFrame(frameRef.current);
  }
  frameRef.current = window.requestAnimationFrame(draw);
}
