import {
  BarcodeFormat,
  BrowserMultiFormatReader,
} from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createCenteredBarcodeCandidate, type BarcodePreprocessMeta } from './barcodePreprocess';
import {
  createCustomBarcodeDetector,
  scanBarcodeCanvas,
  type BarcodeDetectionResult,
  type CustomBarcodeDetector,
} from './CustomBarcodeDetector';

type NativeDetectedBarcode = {
  rawValue?: string;
  format?: string;
};

type NativeBarcodeDetector = {
  detect: (source: CanvasImageSource) => Promise<NativeDetectedBarcode[]>;
};

type NativeBarcodeDetectorConstructor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

type WindowWithBarcodeDetector = Window &
  typeof globalThis & {
    BarcodeDetector?: NativeBarcodeDetectorConstructor;
  };

type ScanCandidate = {
  source: ScanSource;
  angle: number;
  mode: CandidateMode;
};

type ScanSource = 'full' | 'center' | 'wide' | 'middleStrip' | 'lowerStrip';
type CandidateMode = 'normal' | 'enhanced' | 'threshold' | 'inverted';

type DetectionResult = {
  value: string;
  engine: 'zxing' | 'native';
  format?: string | number;
  candidate: ScanCandidate;
  attempt: number;
  preprocessing?: BarcodePreprocessMeta;
};

const logPrefix = '[PhotoBarcodeDemo]';

const barcodeHints = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.CODABAR,
      BarcodeFormat.ITF,
      BarcodeFormat.RSS_14,
      BarcodeFormat.RSS_EXPANDED,
    ],
  ],
  [DecodeHintType.TRY_HARDER, true],
]);

const pureBarcodeHints = new Map<DecodeHintType, unknown>(barcodeHints);
pureBarcodeHints.set(DecodeHintType.PURE_BARCODE, true);

const nativeBarcodeFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
const safeNativeBarcodeFormats = ['ean_13', 'ean_8', 'code_128'];
const scanSources: ScanSource[] = ['center', 'wide', 'middleStrip', 'lowerStrip', 'full'];
const scanAngles = [0, -4, 4, -8, 8, -12, 12, -18, 18, -25, 25];
const candidateModes: CandidateMode[] = ['normal', 'enhanced', 'threshold', 'inverted'];
const maxImageSide = 1800;

export default function App() {
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState('Drop or choose an image.');
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [liveResult, setLiveResult] = useState<BarcodeDetectionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const candidateCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewfinderRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<CustomBarcodeDetector | null>(null);
  const liveCandidateCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const candidates = useMemo(
    () =>
      scanSources.flatMap((source) =>
        scanAngles.flatMap((angle) =>
          candidateModes.map((mode) => ({ source, angle, mode })),
        ),
      ),
    [],
  );

  useEffect(() => () => stopCamera(false), []);

  const scanFile = async (file: File) => {
    stopCamera();
    setBusy(true);
    setResult(null);
    setLiveResult(null);
    setStatus('Loading image...');
    console.clear();
    console.info(`${logPrefix} file selected`, {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    try {
      const url = URL.createObjectURL(file);
      setImageUrl(url);

      const image = await loadImage(url);
      const sourceCanvas = imageCanvasRef.current;
      if (!sourceCanvas) {
        throw new Error('Canvas is not available.');
      }

      drawSourceImage(image, sourceCanvas);
      setStatus('Scanning image...');
      console.info(`${logPrefix} source image ready`, {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        canvasWidth: sourceCanvas.width,
        canvasHeight: sourceCanvas.height,
        detector: 'custom',
      });

      const { result: detected, debug } = scanBarcodeCanvas(sourceCanvas, {
        allowedFormats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'],
        minConsensus: 3,
        requireStableFrames: 1,
        maxAngle: 35,
        debug: true,
      });
      drawDebugCanvas(debug.sourceCanvas, imageCanvasRef.current);
      if (debug.candidateCanvas) {
        drawDebugCanvas(debug.candidateCanvas, candidateCanvasRef.current);
        drawDebugCanvas(debug.candidateCanvas, liveCandidateCanvasRef.current);
      }

      if (detected) {
        setLiveResult(detected);
        setStatus(`Detected: ${detected.value}`);
        console.info(`${logPrefix} DETECTED`, detected);
      } else {
        setStatus('No barcode detected. Try a sharper/cropped photo.');
        console.info(`${logPrefix} no barcode detected`, {
          rejectedReasons: debug.rejectedReasons,
        });
      }
    } catch (error) {
      const normalized = toError(error);
      setStatus(normalized.message);
      console.error(`${logPrefix} failed`, normalized);
    } finally {
      setBusy(false);
    }
  };

  async function startCamera() {
    stopCamera();
    setResult(null);
    setLiveResult(null);
    setStatus('Opening camera...');
    console.clear();
    console.info(`${logPrefix} opening live camera`, {
      isSecureContext: window.isSecureContext,
      hasMediaDevices: Boolean(navigator.mediaDevices),
      hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
    });

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera API is not available in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      const video = videoRef.current;
      if (!video) throw new Error('Video element is not available.');

      streamRef.current = stream;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      await video.play();

      const viewfinder = viewfinderRef.current;
      if (!viewfinder) throw new Error('Viewfinder element is not available.');

      setCameraActive(true);
      setStatus('Live scanning...');
      console.info(`${logPrefix} live camera ready`, {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        tracks: stream.getVideoTracks().map((track) => ({
          label: track.label,
          readyState: track.readyState,
          settings: track.getSettings(),
        })),
      });

      const detector = createCustomBarcodeDetector(video, viewfinder, {
        intervalMs: 100,
        allowedFormats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'],
        minConsensus: 3,
        requireStableFrames: 2,
        maxAngle: 35,
        debug: true,
        onResult: (detected) => {
          setLiveResult(detected);
          setStatus(`Detected: ${detected.value}`);
          console.info(`${logPrefix} LIVE DETECTED`, detected);

          const debugCanvas = detected.debug?.candidateCanvas;
          const target = liveCandidateCanvasRef.current;
          if (debugCanvas && target) {
            target.width = debugCanvas.width;
            target.height = debugCanvas.height;
            const context = target.getContext('2d');
            context?.drawImage(debugCanvas, 0, 0);
          }

          stopCamera();
        },
        onReject: (reasons) => {
          console.info(`${logPrefix} LIVE rejected`, reasons);
        },
        onDebugFrame: (frame) => {
          drawDebugCanvas(frame.sourceCanvas, imageCanvasRef.current);
          if (frame.candidateCanvas) {
            drawDebugCanvas(frame.candidateCanvas, candidateCanvasRef.current);
            drawDebugCanvas(frame.candidateCanvas, liveCandidateCanvasRef.current);
          }
        },
      });
      detectorRef.current = detector;
      detector.start();
    } catch (error) {
      stopCamera();
      const normalized = toError(error);
      setStatus(normalized.message);
      console.error(`${logPrefix} live camera failed`, normalized);
    }
  }

  function stopCamera(updateState = true) {
    if (updateState) setCameraActive(false);

    if (detectorRef.current) {
      detectorRef.current.stop();
      detectorRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  return (
    <main className="app">
      <section className="toolbar">
        <div>
          <h1>Barcode Photo Demo</h1>
          <p>Upload a photo. The scanner writes every useful result to the browser console.</p>
        </div>
        <button className="upload" type="button" onClick={() => (cameraActive ? stopCamera() : void startCamera())}>
          {cameraActive ? 'Stop camera' : 'Start camera'}
        </button>
        <label className="upload">
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void scanFile(file);
              }
              event.target.value = '';
            }}
          />
          Choose photo
        </label>
      </section>

      <section
        className="dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file && file.type.startsWith('image/')) {
            void scanFile(file);
          }
        }}
      >
        {imageUrl ? <img src={imageUrl} alt="Uploaded barcode candidate" /> : <span>Drop image here</span>}
      </section>

      <section className="cameraPanel">
        <div className="cameraHeader">
          <h2>Live camera square</h2>
          <span>{cameraActive ? 'Scanning center square only' : 'Camera is off'}</span>
        </div>
        <div className="cameraViewport">
          <video ref={videoRef} playsInline muted />
          <div className="cameraViewfinder" aria-hidden="true" ref={viewfinderRef}>
            <span className="corner topLeft" />
            <span className="corner topRight" />
            <span className="corner bottomLeft" />
            <span className="corner bottomRight" />
            <span className="barcodeScanLine" />
          </div>
        </div>
      </section>

      <section className="status">
        <p>{status}</p>
        {result ? <pre>{JSON.stringify(result, null, 2)}</pre> : null}
        {liveResult ? <pre>{JSON.stringify(liveResult, null, 2)}</pre> : null}
      </section>

      <section className="debug">
        <div>
          <h2>Source canvas</h2>
          <canvas ref={imageCanvasRef} />
        </div>
        <div>
          <h2>Last candidate</h2>
          <canvas ref={candidateCanvasRef} />
        </div>
        <div>
          <h2>Live barcode candidate</h2>
          <canvas ref={liveCandidateCanvasRef} />
        </div>
      </section>
    </main>
  );
}

async function scanCanvas(
  sourceCanvas: HTMLCanvasElement,
  candidateCanvas: HTMLCanvasElement,
  candidates: ScanCandidate[],
) {
  const reader = new BrowserMultiFormatReader(barcodeHints);
  const pureReader = new BrowserMultiFormatReader(pureBarcodeHints);
  const nativeDetector = createNativeBarcodeDetector();
  const candidateContext = candidateCanvas.getContext('2d', { willReadFrequently: true });
  if (!candidateContext) {
    throw new Error('Candidate canvas context is not available.');
  }

  const directResult = await scanDirectCanvas(reader, pureReader, nativeDetector, sourceCanvas);
  if (directResult) return directResult;

  const preprocessed = createCenteredBarcodeCandidate(sourceCanvas);
  if (preprocessed) {
    console.info(`${logPrefix} centered preprocessing candidate`, preprocessed.meta);
    drawCanvasToCanvas(preprocessed.canvas, candidateCanvas, candidateContext);

    const preprocessedDirectResult = await scanDirectCanvas(
      reader,
      pureReader,
      nativeDetector,
      preprocessed.canvas,
      preprocessed.meta,
    );
    if (preprocessedDirectResult) return preprocessedDirectResult;

    const preprocessedCandidateResult = await scanCandidateList(
      preprocessed.canvas,
      candidateCanvas,
      candidateContext,
      candidates,
      reader,
      pureReader,
      nativeDetector,
      preprocessed.meta,
    );
    if (preprocessedCandidateResult) return preprocessedCandidateResult;
  } else {
    console.info(`${logPrefix} centered preprocessing did not find a barcode-like band`);
  }

  return scanCandidateList(
    sourceCanvas,
    candidateCanvas,
    candidateContext,
    candidates,
    reader,
    pureReader,
    nativeDetector,
  );
}

async function scanCandidateList(
  sourceCanvas: HTMLCanvasElement,
  candidateCanvas: HTMLCanvasElement,
  candidateContext: CanvasRenderingContext2D,
  candidates: ScanCandidate[],
  reader: BrowserMultiFormatReader,
  pureReader: BrowserMultiFormatReader,
  nativeDetector: NativeBarcodeDetector | null,
  preprocessing?: BarcodePreprocessMeta,
) {
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const crop = getScanCrop(candidate.source, sourceCanvas.width, sourceCanvas.height);
    drawCandidate(sourceCanvas, candidateCanvas, candidateContext, crop, candidate);

    const nativeValue = await detectNativeBarcode(nativeDetector, candidateCanvas);
    if (nativeValue?.value) {
      return {
        value: nativeValue.value,
        engine: 'native' as const,
        format: nativeValue.format,
        candidate,
        attempt: index + 1,
        preprocessing,
      };
    }

    try {
      const decoded = decodeWithReaders([reader, pureReader], candidateCanvas);
      return {
        value: decoded.getText(),
        engine: 'zxing' as const,
        format: decoded.getBarcodeFormat?.(),
        candidate,
        attempt: index + 1,
        preprocessing,
      };
    } catch (error) {
      if (!isExpectedScanMiss(error)) {
        console.warn(`${logPrefix} candidate error`, {
          candidate,
          attempt: index + 1,
          error,
        });
      }
    }

    if ((index + 1) % 25 === 0) {
      console.info(`${logPrefix} scanning progress`, {
        attempts: index + 1,
        total: candidates.length,
      });
      await yieldToBrowser();
    }
  }

  return null;
}

async function scanDirectCanvas(
  reader: BrowserMultiFormatReader,
  pureReader: BrowserMultiFormatReader,
  nativeDetector: NativeBarcodeDetector | null,
  sourceCanvas: HTMLCanvasElement,
  preprocessing?: BarcodePreprocessMeta,
) {
  console.info(`${logPrefix} direct source decode`);

  const nativeValue = await detectNativeBarcode(nativeDetector, sourceCanvas);
  if (nativeValue?.value) {
    return {
      value: nativeValue.value,
      engine: 'native' as const,
      format: nativeValue.format,
      candidate: { source: 'full' as const, angle: 0, mode: 'normal' as const },
      attempt: 0,
      preprocessing,
    };
  }

  try {
    const decoded = decodeWithReaders([pureReader, reader], sourceCanvas);
    return {
      value: decoded.getText(),
      engine: 'zxing' as const,
      format: decoded.getBarcodeFormat?.(),
      candidate: { source: 'full' as const, angle: 0, mode: 'normal' as const },
      attempt: 0,
      preprocessing,
    };
  } catch (error) {
    console.info(`${logPrefix} direct source decode missed`, {
      errorName: error instanceof Error ? error.name : String(error),
      constructorName:
        typeof error === 'object' && error !== null && 'constructor' in error
          ? (error.constructor as { name?: string }).name
          : '',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
}

function decodeWithReaders(readers: BrowserMultiFormatReader[], canvas: HTMLCanvasElement) {
  let lastError: unknown = null;

  for (const [readerIndex, reader] of readers.entries()) {
    try {
      const decoded = reader.decodeFromCanvas(canvas);
      console.info(`${logPrefix} zxing decode matched`, {
        reader: readerIndex === 0 ? 'primary' : 'fallback',
        width: canvas.width,
        height: canvas.height,
        format: decoded.getBarcodeFormat?.(),
        text: decoded.getText(),
      });
      return decoded;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('No barcode found.');
}

function drawCanvasToCanvas(
  sourceCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  targetContext: CanvasRenderingContext2D,
) {
  targetCanvas.width = sourceCanvas.width;
  targetCanvas.height = sourceCanvas.height;
  targetContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetContext.drawImage(sourceCanvas, 0, 0);
}

function drawDebugCanvas(sourceCanvas: HTMLCanvasElement, targetCanvas: HTMLCanvasElement | null) {
  if (!targetCanvas) return;
  targetCanvas.width = sourceCanvas.width;
  targetCanvas.height = sourceCanvas.height;
  const context = targetCanvas.getContext('2d', { willReadFrequently: true });
  context?.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  context?.drawImage(sourceCanvas, 0, 0);
}

function drawSourceImage(image: HTMLImageElement, canvas: HTMLCanvasElement) {
  const scale = Math.min(1, maxImageSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Source canvas context is not available.');

  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
}

function getScanCrop(source: ScanSource, width: number, height: number) {
  if (source === 'full') return { x: 0, y: 0, width, height };

  if (source === 'middleStrip') {
    const cropHeight = Math.round(height * 0.35);
    return {
      x: 0,
      y: Math.round((height - cropHeight) / 2),
      width,
      height: cropHeight,
    };
  }

  if (source === 'lowerStrip') {
    const cropHeight = Math.round(height * 0.45);
    return {
      x: 0,
      y: Math.round(height * 0.35),
      width,
      height: cropHeight,
    };
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
  candidate: ScanCandidate,
) {
  const scale = candidate.mode === 'normal' ? 1 : 1.75;
  targetCanvas.width = Math.round(crop.width * scale);
  targetCanvas.height = Math.round(crop.height * scale);
  targetContext.save();
  targetContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetContext.fillStyle = candidate.mode === 'inverted' ? '#000' : '#fff';
  targetContext.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetContext.translate(targetCanvas.width / 2, targetCanvas.height / 2);
  targetContext.rotate((candidate.angle * Math.PI) / 180);
  targetContext.imageSmoothingEnabled = candidate.mode === 'normal';

  if (candidate.mode === 'enhanced') {
    targetContext.filter = 'grayscale(1) contrast(2) brightness(1.12)';
  } else if (candidate.mode === 'threshold') {
    targetContext.filter = 'grayscale(1) contrast(4) brightness(1.2)';
  } else if (candidate.mode === 'inverted') {
    targetContext.filter = 'grayscale(1) invert(1) contrast(2) brightness(1.05)';
  } else {
    targetContext.filter = 'none';
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

  if (candidate.mode === 'threshold' || candidate.mode === 'inverted') {
    applyBinaryThreshold(targetContext, targetCanvas.width, targetCanvas.height, candidate.mode === 'inverted');
  }
}

function applyBinaryThreshold(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  invert: boolean,
) {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const isDark = luminance < 150;
    const value = invert ? (isDark ? 255 : 0) : isDark ? 0 : 255;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }

  context.putImageData(image, 0, 0);
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
    const result = results.find((item) => item.rawValue);
    return result?.rawValue ? { value: result.rawValue, format: result.format } : null;
  } catch {
    return null;
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image.'));
    image.src = url;
  });
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

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function toError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : 'Unknown barcode scan error.');
}
