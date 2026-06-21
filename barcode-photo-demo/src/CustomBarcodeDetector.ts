// Self-contained EAN-13 / EAN-8 / UPC-A / UPC-E detector. No external barcode SDK.
// Operates strictly on a region of interest (ROI) mapped from a DOM element (the
// camera viewfinder) onto the source <video> element's native pixel coordinates.

export type BarcodeFormat = 'EAN_13' | 'EAN_8' | 'UPC_A' | 'UPC_E';

export type RectPx = { x: number; y: number; width: number; height: number };

export type BarcodeDetectionResult = {
  value: string;
  format: BarcodeFormat;
  checksumValid: true;
  confidence: number;
  angle: number;
  roi: RectPx;
  scanlines: {
    total: number;
    matched: number;
  };
  debug?: {
    candidateCanvas?: HTMLCanvasElement;
    binaryCanvas?: HTMLCanvasElement;
    rejectedReasons?: string[];
  };
};

export type BarcodeDebugFrame = {
  roi: RectPx;
  sourceCanvas: HTMLCanvasElement;
  candidateCanvas?: HTMLCanvasElement;
  rejectedReasons?: string[];
};

export type BarcodeCanvasScanResult = {
  result: BarcodeDetectionResult | null;
  debug: BarcodeDebugFrame;
};

export type CustomBarcodeDetectorOptions = {
  intervalMs?: number; // default 100
  allowedFormats?: BarcodeFormat[];
  minConsensus?: number; // default 3
  requireStableFrames?: number; // default 2
  maxAngle?: number; // default 35
  debug?: boolean;
  onResult?: (result: BarcodeDetectionResult) => void;
  onReject?: (reasons: string[]) => void;
  onDebugFrame?: (frame: BarcodeDebugFrame) => void;
};

export type CustomBarcodeDetector = {
  start(): void;
  stop(): void;
  scanFrame(): Promise<BarcodeDetectionResult | null>;
};

const logPrefix = '[CustomBarcodeDetector]';

const DEFAULTS: Required<Omit<CustomBarcodeDetectorOptions, 'onResult' | 'onReject' | 'onDebugFrame'>> = {
  intervalMs: 100,
  allowedFormats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'],
  minConsensus: 3,
  requireStableFrames: 2,
  maxAngle: 35,
  debug: false,
};

export const DEFAULT_BARCODE_DETECTOR_OPTIONS = DEFAULTS;

// ---------------------------------------------------------------------------
// Digit pattern tables (7-bit module strings, 1 = dark, 0 = light)
// ---------------------------------------------------------------------------

// Run-length width tables (4 widths per digit, summing to 7 modules). R-code
// uses the same width table as L-code: only the starting color differs, and
// ratio-based matching is color-agnostic.
const L_WIDTHS: number[][] = [
  [3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2],
  [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2],
];

const G_WIDTHS: number[][] = [
  [1, 1, 2, 3], [1, 2, 2, 2], [2, 2, 1, 2], [1, 1, 4, 1], [2, 3, 1, 1],
  [1, 3, 2, 1], [4, 1, 1, 1], [2, 1, 3, 1], [3, 1, 2, 1], [2, 1, 1, 3],
];

const GUARD_WIDTHS = [1, 1, 1];
const MIDDLE_WIDTHS = [1, 1, 1, 1, 1];
const UPCE_END_WIDTHS = [1, 1, 1, 1, 1, 1];

// Maximum allowed mean normalized deviation between measured run widths and a
// candidate digit/guard pattern. Loose enough to tolerate camera blur,
// anti-aliasing and fractional module widths; tight enough to discriminate
// between digits.
const DIGIT_MATCH_TOLERANCE = 0.42;
const GUARD_MATCH_TOLERANCE = 0.55;

const EAN13_PARITY_TABLE: number[][] = [
  [0, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 1, 1],
  [0, 0, 1, 1, 0, 1],
  [0, 0, 1, 1, 1, 0],
  [0, 1, 0, 0, 1, 1],
  [0, 1, 1, 0, 0, 1],
  [0, 1, 1, 1, 0, 0],
  [0, 1, 0, 1, 0, 1],
  [0, 1, 0, 1, 1, 0],
  [0, 1, 1, 0, 1, 0],
];

// UPC-E parity -> check digit, for number system 0. Number system 1 uses the
// bitwise complement of each pattern.
const UPCE_NUMSYS0_PATTERNS: number[] = [
  0b111000, 0b110100, 0b110010, 0b110001, 0b101100,
  0b100110, 0b100011, 0b101010, 0b101001, 0b100101,
];

// ---------------------------------------------------------------------------
// Geometry: map the viewfinder DOM rect onto video pixel coordinates
// ---------------------------------------------------------------------------

export function computeRoiFromViewfinder(video: HTMLVideoElement, viewfinder: HTMLElement): RectPx | null {
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  if (!videoWidth || !videoHeight) return null;

  const videoBox = video.getBoundingClientRect();
  const finderBox = viewfinder.getBoundingClientRect();
  if (videoBox.width <= 0 || videoBox.height <= 0) return null;

  // video is rendered with object-fit: cover. Compute the displayed
  // (post-cover-crop) source rect in video pixel space, then map the
  // viewfinder's on-screen rect into that source rect.
  const videoAspect = videoWidth / videoHeight;
  const boxAspect = videoBox.width / videoBox.height;

  let visibleSrcW = videoWidth;
  let visibleSrcH = videoHeight;
  let visibleSrcX = 0;
  let visibleSrcY = 0;

  if (boxAspect > videoAspect) {
    // box is relatively wider than the video -> crop video vertically
    visibleSrcH = videoWidth / boxAspect;
    visibleSrcY = (videoHeight - visibleSrcH) / 2;
  } else {
    // box is relatively taller -> crop video horizontally
    visibleSrcW = videoHeight * boxAspect;
    visibleSrcX = (videoWidth - visibleSrcW) / 2;
  }

  const scaleX = visibleSrcW / videoBox.width;
  const scaleY = visibleSrcH / videoBox.height;

  const relLeft = finderBox.left - videoBox.left;
  const relTop = finderBox.top - videoBox.top;

  const x = visibleSrcX + relLeft * scaleX;
  const y = visibleSrcY + relTop * scaleY;
  const width = finderBox.width * scaleX;
  const height = finderBox.height * scaleY;

  const clampedX = clamp(x, 0, videoWidth - 1);
  const clampedY = clamp(y, 0, videoHeight - 1);
  const clampedW = clamp(width, 1, videoWidth - clampedX);
  const clampedH = clamp(height, 1, videoHeight - clampedY);

  return {
    x: Math.round(clampedX),
    y: Math.round(clampedY),
    width: Math.round(clampedW),
    height: Math.round(clampedH),
  };
}

// ---------------------------------------------------------------------------
// Detector implementation
// ---------------------------------------------------------------------------

export function scanBarcodeCanvas(
  canvas: HTMLCanvasElement,
  options: CustomBarcodeDetectorOptions = {},
): BarcodeCanvasScanResult {
  const opts = { ...DEFAULTS, ...options };
  const roi = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const grayscale = canvasToGrayscale(canvas);
  const rejectedReasons: string[] = [];
  const debug: DetectionDebug = {};
  const result = detectInGrayscale(grayscale, roi, opts, rejectedReasons, debug);

  return {
    result,
    debug: {
      roi,
      sourceCanvas: cloneCanvas(grayscale.canvas),
      candidateCanvas: result?.debug?.candidateCanvas ?? debug.candidateCanvas,
      rejectedReasons: rejectedReasons.length ? [...rejectedReasons] : undefined,
    },
  };
}

export function createCustomBarcodeDetector(
  video: HTMLVideoElement,
  viewfinder: HTMLElement,
  options: CustomBarcodeDetectorOptions = {},
): CustomBarcodeDetector {
  const opts = { ...DEFAULTS, ...options };

  let timer: number | null = null;
  let running = false;
  let scanningInProgress = false;
  let lastStableValue: string | null = null;
  let stableCount = 0;

  const roiCanvas = document.createElement('canvas');

  function loop() {
    if (!running) return;
    timer = window.setTimeout(() => {
      if (scanningInProgress) {
        // Previous frame still processing: skip this tick entirely.
        loop();
        return;
      }
      void scanFrame().finally(loop);
    }, opts.intervalMs);
  }

  function start() {
    if (running) return;
    running = true;
    console.info(`${logPrefix} start`, { intervalMs: opts.intervalMs, allowedFormats: opts.allowedFormats });
    loop();
  }

  function stop() {
    running = false;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    lastStableValue = null;
    stableCount = 0;
    console.info(`${logPrefix} stop`);
  }

  async function scanFrame(): Promise<BarcodeDetectionResult | null> {
    if (scanningInProgress) return null;
    scanningInProgress = true;

    try {
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;

      const roi = computeRoiFromViewfinder(video, viewfinder);
      if (!roi) return null;

      const grayscale = captureRoiGrayscale(video, roi, roiCanvas);
      console.info(`${logPrefix} capture`, { roi, width: grayscale.width, height: grayscale.height });

      const rejectedReasons: string[] = [];
      const debug: DetectionDebug = {};
      const attempt = detectInGrayscale(grayscale, roi, opts, rejectedReasons, debug);
      opts.onDebugFrame?.({
        roi,
        sourceCanvas: cloneCanvas(grayscale.canvas),
        candidateCanvas: attempt?.debug?.candidateCanvas ?? debug.candidateCanvas,
        rejectedReasons: rejectedReasons.length ? [...rejectedReasons] : undefined,
      });

      if (!attempt) {
        if (opts.debug) console.info(`${logPrefix} rejected`, rejectedReasons);
        opts.onReject?.(rejectedReasons);
        lastStableValue = null;
        stableCount = 0;
        return null;
      }

      const isStable = attempt.value === lastStableValue;
      stableCount = isStable ? stableCount + 1 : 1;
      lastStableValue = attempt.value;

      const highConfidenceSingleFrame = attempt.confidence >= 0.92;
      const stableEnough = stableCount >= opts.requireStableFrames;

      if (!stableEnough && !highConfidenceSingleFrame) {
        console.info(`${logPrefix} awaiting frame stability`, {
          value: attempt.value,
          stableCount,
          required: opts.requireStableFrames,
        });
        return null;
      }

      console.info(`${logPrefix} DETECTED`, {
        value: attempt.value,
        format: attempt.format,
        confidence: attempt.confidence,
        angle: attempt.angle,
        scanlines: attempt.scanlines,
      });

      opts.onResult?.(attempt);
      return attempt;
    } finally {
      scanningInProgress = false;
    }
  }

  return { start, stop, scanFrame };
}

// ---------------------------------------------------------------------------
// Frame capture limited to ROI
// ---------------------------------------------------------------------------

type GrayImage = { data: Float32Array; width: number; height: number; canvas: HTMLCanvasElement };
type DetectionDebug = {
  candidateCanvas?: HTMLCanvasElement;
};

function captureRoiGrayscale(video: HTMLVideoElement, roi: RectPx, canvas: HTMLCanvasElement): GrayImage {
  canvas.width = roi.width;
  canvas.height = roi.height;
  const context = get2d(canvas);
  context.drawImage(video, roi.x, roi.y, roi.width, roi.height, 0, 0, roi.width, roi.height);

  const image = context.getImageData(0, 0, roi.width, roi.height);
  const data = new Float32Array(roi.width * roi.height);
  for (let i = 0, p = 0; i < image.data.length; i += 4, p += 1) {
    data[p] = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114;
  }

  return { data, width: roi.width, height: roi.height, canvas };
}

function canvasToGrayscale(sourceCanvas: HTMLCanvasElement): GrayImage {
  const canvas = cloneCanvas(sourceCanvas);
  const context = get2d(canvas);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = new Float32Array(canvas.width * canvas.height);

  for (let i = 0, p = 0; i < image.data.length; i += 4, p += 1) {
    data[p] = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114;
  }

  return { data, width: canvas.width, height: canvas.height, canvas };
}

// ---------------------------------------------------------------------------
// Top-level detection over one ROI grayscale buffer
// ---------------------------------------------------------------------------

type InternalResult = BarcodeDetectionResult;

function detectInGrayscale(
  gray: GrayImage,
  roi: RectPx,
  opts: Required<Omit<CustomBarcodeDetectorOptions, 'onResult' | 'onReject' | 'onDebugFrame'>>,
  rejectedReasons: string[],
  debug?: DetectionDebug,
): InternalResult | null {
  const angle = detectDominantAngle(gray, opts.maxAngle);
  if (angle === null) {
    rejectedReasons.push('no-dominant-angle');
    return null;
  }

  const rotated = rotateGrayscale(gray, angle.fine);
  console.info(`${logPrefix} angle`, { coarse: angle.coarse, fine: angle.fine });
  if (opts.debug && debug) {
    debug.candidateCanvas = cloneCanvas(rotated.canvas);
  }

  const band = findBarcodeBand(rotated, rejectedReasons);
  if (!band) return null;

  console.info(`${logPrefix} candidate band`, band);
  if (opts.debug && debug) {
    debug.candidateCanvas = cropToCanvas(rotated, band);
  }

  const decodeAttempt = decodeBand(rotated, band, opts, rejectedReasons);
  if (!decodeAttempt) return null;

  return {
    value: decodeAttempt.value,
    format: decodeAttempt.format,
    checksumValid: true,
    confidence: decodeAttempt.confidence,
    angle: angle.fine,
    roi,
    scanlines: decodeAttempt.scanlines,
    debug: opts.debug
      ? {
          candidateCanvas: cropToCanvas(rotated, band),
          rejectedReasons: rejectedReasons.length ? [...rejectedReasons] : undefined,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Angle detection: coarse pass (5deg) then fine pass (1deg)
// ---------------------------------------------------------------------------

// Relative margin within which two angle scores are considered a tie; ties
// are broken in favor of the angle closer to 0, since real-world barcodes
// are far more often near-level than steeply tilted, and a small numerical
// edge for a large angle is usually noise rather than a genuine tilt.
const ANGLE_TIE_EPSILON = 0.03;

function isAngleBetter(score: number, angle: number, bestScore: number, bestAngle: number): boolean {
  if (bestScore <= 0) return score > bestScore;
  const relativeGain = (score - bestScore) / bestScore;
  if (relativeGain > ANGLE_TIE_EPSILON) return true;
  if (relativeGain < -ANGLE_TIE_EPSILON) return false;
  return Math.abs(angle) < Math.abs(bestAngle);
}

function detectDominantAngle(gray: GrayImage, maxAngle: number): { coarse: number; fine: number } | null {
  let bestCoarse = 0;
  let bestCoarseScore = -Infinity;

  for (let a = -maxAngle; a <= maxAngle; a += 5) {
    const score = scoreAngle(gray, a);
    if (isAngleBetter(score, a, bestCoarseScore, bestCoarse)) {
      bestCoarseScore = score;
      bestCoarse = a;
    }
  }

  let bestFine = bestCoarse;
  let bestFineScore = bestCoarseScore;
  for (let a = bestCoarse - 5; a <= bestCoarse + 5; a += 1) {
    const clamped = clamp(a, -maxAngle, maxAngle);
    const score = scoreAngle(gray, clamped);
    if (isAngleBetter(score, clamped, bestFineScore, bestFine)) {
      bestFineScore = score;
      bestFine = clamped;
    }
  }

  if (bestFineScore <= 0) return null;
  return { coarse: bestCoarse, fine: bestFine };
}

// Estimate how "barcode-like" a rotation angle is by measuring vertical-edge
// energy along rows after a cheap shear approximation (no full resample needed
// for scoring, just sampled columns at the candidate angle).
function scoreAngle(gray: GrayImage, angleDeg: number): number {
  const theta = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const { data, width, height } = gray;
  const cx = width / 2;
  const cy = height / 2;

  let energy = 0;
  let rowsSampled = 0;
  const stepY = Math.max(1, Math.floor(height / 40));

  for (let y = 0; y < height; y += stepY) {
    rowsSampled += 1;
    let previous: number | null = null;
    for (let x = 1; x < width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = Math.round(cx + dx * cos - dy * sin);
      const sy = Math.round(cy + dx * sin + dy * cos);

      if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
        // Out-of-bounds after rotation: treat as a broken run (no edge), but
        // still count this position toward the fixed denominator below so
        // that angles which clip heavily near the frame edges are penalized
        // instead of rewarded by an artificially shrunken sample count.
        previous = null;
        continue;
      }

      const value = data[sy * width + sx];
      if (previous !== null) {
        const diff = Math.abs(value - previous);
        if (diff > 20) energy += diff;
      }
      previous = value;
    }
  }

  // Fixed denominator (independent of how many samples happened to land
  // out-of-bounds) so every candidate angle is scored over the same nominal
  // sample budget.
  const totalSamples = rowsSampled * (width - 1);
  return totalSamples > 0 ? energy / totalSamples : -Infinity;
}

// ---------------------------------------------------------------------------
// Deskew: rotate the full ROI buffer so barcode bars become vertical, keeping
// quiet zones intact and filling exposed corners with a neutral background.
// ---------------------------------------------------------------------------

function rotateGrayscale(gray: GrayImage, angleDeg: number): GrayImage {
  if (Math.abs(angleDeg) < 0.1) {
    return gray;
  }

  const canvas = document.createElement('canvas');
  canvas.width = gray.width;
  canvas.height = gray.height;
  const context = get2d(canvas);

  // Paint the source grayscale buffer to a temp canvas first.
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = gray.width;
  sourceCanvas.height = gray.height;
  const sourceCtx = get2d(sourceCanvas);
  const sourceImage = sourceCtx.createImageData(gray.width, gray.height);
  for (let i = 0, p = 0; p < gray.data.length; i += 4, p += 1) {
    const v = gray.data[p];
    sourceImage.data[i] = v;
    sourceImage.data[i + 1] = v;
    sourceImage.data[i + 2] = v;
    sourceImage.data[i + 3] = 255;
  }
  sourceCtx.putImageData(sourceImage, 0, 0);

  context.fillStyle = '#ffffff'; // neutral white background, never crop quiet zones
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((angleDeg * Math.PI) / 180);
  context.drawImage(sourceCanvas, -gray.width / 2, -gray.height / 2);

  const rotatedImage = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = new Float32Array(canvas.width * canvas.height);
  for (let i = 0, p = 0; i < rotatedImage.data.length; i += 4, p += 1) {
    data[p] = rotatedImage.data[i] * 0.299 + rotatedImage.data[i + 1] * 0.587 + rotatedImage.data[i + 2] * 0.114;
  }

  return { data, width: canvas.width, height: canvas.height, canvas };
}

// ---------------------------------------------------------------------------
// Barcode band detection within the deskewed image
// ---------------------------------------------------------------------------

function findBarcodeBand(gray: GrayImage, rejectedReasons: string[]): RectPx | null {
  const { data, width, height } = gray;
  const rowEnergy = new Float32Array(height);

  for (let y = 0; y < height; y += 1) {
    let energy = 0;
    let transitions = 0;
    let previous = data[y * width];
    for (let x = 1; x < width; x += 1) {
      const value = data[y * width + x];
      const diff = Math.abs(value - previous);
      if (diff > 22) {
        energy += diff;
        transitions += 1;
      }
      previous = value;
    }
    rowEnergy[y] = transitions >= 12 ? energy / width : 0;
  }

  const smoothRows = smooth(rowEnergy, 6);
  const rowRange = findStrongRange(smoothRows, Math.round(height * 0.06), Math.round(height * 0.85));
  if (!rowRange) {
    rejectedReasons.push('insufficient-transition-density-rows');
    return null;
  }

  const colEnergy = new Float32Array(width);
  for (let x = 1; x < width; x += 1) {
    let energy = 0;
    for (let y = rowRange.start; y < rowRange.end; y += 1) {
      const diff = Math.abs(data[y * width + x] - data[y * width + x - 1]);
      if (diff > 22) energy += diff;
    }
    colEnergy[x] = energy / Math.max(1, rowRange.end - rowRange.start);
  }

  const smoothCols = smooth(colEnergy, 4);
  const colRange = findStrongRange(smoothCols, Math.round(width * 0.2), Math.round(width * 0.96));
  if (!colRange) {
    rejectedReasons.push('barcode-band-too-narrow');
    return null;
  }

  const padX = Math.round((colRange.end - colRange.start) * 0.18);
  const padY = Math.round((rowRange.end - rowRange.start) * 0.3);

  const x = clamp(colRange.start - padX, 0, width - 1);
  const y = clamp(rowRange.start - padY, 0, height - 1);
  const right = clamp(colRange.end + padX, x + 1, width);
  const bottom = clamp(rowRange.end + padY, y + 1, height);

  const band: RectPx = { x, y, width: right - x, height: bottom - y };

  if (band.width < 40) {
    rejectedReasons.push('barcode-band-too-narrow');
    return null;
  }
  if (band.height < 12) {
    rejectedReasons.push('barcode-band-too-short');
    return null;
  }

  // contrast check
  let min = 255;
  let max = 0;
  for (let yy = band.y; yy < band.y + band.height; yy += 1) {
    for (let xx = band.x; xx < band.x + band.width; xx += 1) {
      const v = data[yy * width + xx];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (max - min < 55) {
    rejectedReasons.push('contrast-below-minimum');
    return null;
  }

  // quiet zone presence: margins on either side of band must be relatively flat/light
  if (!hasQuietZone(gray, band)) {
    rejectedReasons.push('quiet-zone-missing');
    return null;
  }

  return band;
}

function hasQuietZone(gray: GrayImage, band: RectPx): boolean {
  const { data, width } = gray;
  const quietWidth = Math.max(6, Math.round(band.width * 0.06));
  const midY = Math.round(band.y + band.height / 2);

  const leftStart = clamp(band.x - quietWidth, 0, width - 1);
  const rightEnd = clamp(band.x + band.width + quietWidth, 0, width - 1);
  if (band.x - leftStart < 3 || rightEnd - (band.x + band.width) < 3) return false;

  let leftSum = 0;
  let leftCount = 0;
  for (let x = leftStart; x < band.x; x += 1) {
    leftSum += data[midY * width + x];
    leftCount += 1;
  }
  let rightSum = 0;
  let rightCount = 0;
  for (let x = band.x + band.width; x < rightEnd; x += 1) {
    rightSum += data[midY * width + x];
    rightCount += 1;
  }

  const leftAvg = leftCount ? leftSum / leftCount : 0;
  const rightAvg = rightCount ? rightSum / rightCount : 0;
  // Quiet zone should be brighter than mid-gray; a fully dark margin means no quiet zone.
  return leftAvg > 110 || rightAvg > 110;
}

function findStrongRange(values: Float32Array, minSize: number, maxSize: number): { start: number; end: number } | null {
  let max = 0;
  for (const v of values) max = Math.max(max, v);
  if (max <= 0) return null;

  const threshold = max * 0.3;
  let bestStart = -1;
  let bestEnd = -1;
  let bestLen = 0;
  let curStart = -1;

  for (let i = 0; i < values.length; i += 1) {
    if (values[i] >= threshold) {
      if (curStart === -1) curStart = i;
    } else if (curStart !== -1) {
      const len = i - curStart;
      if (len > bestLen) {
        bestLen = len;
        bestStart = curStart;
        bestEnd = i;
      }
      curStart = -1;
    }
  }
  if (curStart !== -1) {
    const len = values.length - curStart;
    if (len > bestLen) {
      bestLen = len;
      bestStart = curStart;
      bestEnd = values.length;
    }
  }

  if (bestStart === -1 || bestLen < minSize) return null;

  if (bestEnd - bestStart > maxSize) {
    const center = Math.round((bestStart + bestEnd) / 2);
    bestStart = clamp(Math.round(center - maxSize / 2), 0, values.length - maxSize);
    bestEnd = bestStart + maxSize;
  }

  return { start: bestStart, end: bestEnd };
}

// ---------------------------------------------------------------------------
// Scanline decoding
// ---------------------------------------------------------------------------

type DecodeAttempt = {
  value: string;
  format: BarcodeFormat;
  confidence: number;
  scanlines: { total: number; matched: number };
};

// Rejection reasons surfaced from row-level decoding, in priority order (most
// specific/diagnostic first) for picking a single representative reason.
const ROW_REASON_PRIORITY = [
  'checksum-invalid',
  'end-guard-not-found',
  'format-not-supported-code128-suspected',
  'middle-guard-not-found',
  'left-digit-decode-failed',
  'right-digit-decode-failed',
  'digit-group-out-of-bounds',
  'quiet-zone-missing',
  'start-guard-not-found',
  'binarization-too-sparse',
];

function decodeBand(
  gray: GrayImage,
  band: RectPx,
  opts: Required<Omit<CustomBarcodeDetectorOptions, 'onResult' | 'onReject' | 'onDebugFrame'>>,
  rejectedReasons: string[],
): DecodeAttempt | null {
  const lineCount = clamp(13, 7, 15);
  const votes = new Map<string, { count: number; format: BarcodeFormat }>();
  const rowReasonCounts = new Map<string, number>();
  let usableLines = 0;
  let glareSkipped = 0;

  for (let i = 0; i < lineCount; i += 1) {
    const t = (i + 1) / (lineCount + 1);
    const rowY = Math.round(band.y + t * band.height);
    const row = extractRow(gray, rowY, band.x, band.width);

    if (isGlareDominant(row)) {
      glareSkipped += 1;
      continue;
    }

    usableLines += 1;
    const outcome = decodeRow(row);

    if (!outcome.ok) {
      rowReasonCounts.set(outcome.reason, (rowReasonCounts.get(outcome.reason) ?? 0) + 1);
      continue;
    }
    if (!opts.allowedFormats.includes(outcome.format)) {
      rowReasonCounts.set('format-not-allowed', (rowReasonCounts.get('format-not-allowed') ?? 0) + 1);
      continue;
    }

    const key = `${outcome.format}:${outcome.value}`;
    const entry = votes.get(key) ?? { count: 0, format: outcome.format };
    entry.count += 1;
    votes.set(key, entry);
  }

  if (usableLines === 0) {
    rejectedReasons.push('all-scanlines-glare-affected');
    return null;
  }

  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, entry] of votes) {
    if (entry.count > bestCount) {
      bestCount = entry.count;
      bestKey = key;
    }
  }

  if (!bestKey || bestCount < opts.minConsensus) {
    rejectedReasons.push('insufficient-scanline-consensus');
    rejectedReasons.push(summarizeRowReasons(rowReasonCounts, usableLines));
    return null;
  }

  const [format, value] = splitOnce(bestKey, ':');
  const confidence = Math.min(1, bestCount / lineCount);

  return {
    value,
    format: format as BarcodeFormat,
    confidence,
    scanlines: { total: lineCount, matched: bestCount },
  };
}

// Pick the single most diagnostic row-level rejection reason (by priority,
// then frequency) and format it with an occurrence count for debugging.
function summarizeRowReasons(rowReasonCounts: Map<string, number>, usableLines: number): string {
  if (rowReasonCounts.size === 0) return 'no-scanline-decoded-a-value';

  let best: string | null = null;
  let bestPriority = Number.POSITIVE_INFINITY;
  let bestCount = 0;

  for (const [reason, count] of rowReasonCounts) {
    const priority = ROW_REASON_PRIORITY.indexOf(reason);
    const effectivePriority = priority === -1 ? ROW_REASON_PRIORITY.length : priority;
    if (effectivePriority < bestPriority || (effectivePriority === bestPriority && count > bestCount)) {
      bestPriority = effectivePriority;
      best = reason;
      bestCount = count;
    }
  }

  return `${best}(${bestCount}/${usableLines})`;
}

function splitOnce(input: string, sep: string): [string, string] {
  const idx = input.indexOf(sep);
  return [input.slice(0, idx), input.slice(idx + 1)];
}

function extractRow(gray: GrayImage, y: number, x: number, width: number): Float32Array {
  const clampedY = clamp(y, 0, gray.height - 1);
  const row = new Float32Array(width);
  for (let i = 0; i < width; i += 1) {
    const xx = clamp(x + i, 0, gray.width - 1);
    row[i] = gray.data[clampedY * gray.width + xx];
  }
  return row;
}

function isGlareDominant(row: Float32Array): boolean {
  let overexposed = 0;
  for (const v of row) {
    if (v > 248) overexposed += 1;
  }
  return overexposed / row.length > 0.35;
}

type RowDecodeOutcome =
  | { ok: true; value: string; format: BarcodeFormat }
  | { ok: false; reason: string };

// Binarize a single row with an Otsu-style threshold, extract run-lengths,
// then decode using tolerant ratio matching against the standard EAN/UPC
// width tables -- the same approach real barcode readers use, robust to
// blur, anti-aliasing and fractional/sub-pixel module widths.
function decodeRow(row: Float32Array): RowDecodeOutcome {
  const threshold = otsuThreshold(row);
  const binary = new Uint8Array(row.length);
  for (let i = 0; i < row.length; i += 1) binary[i] = row[i] < threshold ? 1 : 0; // 1 = dark

  const runs = toRuns(binary);
  if (runs.length < 20) return { ok: false, reason: 'binarization-too-sparse' };

  const candidates = findStartGuardCandidates(runs);
  if (candidates.length === 0) {
    return { ok: false, reason: hasAnyGuardShape(runs) ? 'quiet-zone-missing' : 'start-guard-not-found' };
  }

  let bestFailure: RowDecodeOutcome = { ok: false, reason: 'start-guard-not-found' };

  for (const candidate of candidates.slice(0, 6)) {
    const ean13 = tryDecodeStructured(runs, candidate, 6, 6, true);
    if (ean13.ok) return ean13;
    if (isBetterFailure(ean13, bestFailure)) bestFailure = ean13;

    const ean8 = tryDecodeStructured(runs, candidate, 4, 4, false);
    if (ean8.ok) return ean8;
    if (isBetterFailure(ean8, bestFailure)) bestFailure = ean8;

    const upce = tryDecodeUpcE(runs, candidate);
    if (upce.ok) return upce;
    if (isBetterFailure(upce, bestFailure)) bestFailure = upce;
  }

  return bestFailure;
}

function isBetterFailure(candidate: RowDecodeOutcome, current: RowDecodeOutcome): boolean {
  if (candidate.ok) return false;
  if (current.ok) return false;
  const candidateRank = ROW_REASON_PRIORITY.indexOf(candidate.reason);
  const currentRank = ROW_REASON_PRIORITY.indexOf(current.reason);
  const candidateEffective = candidateRank === -1 ? ROW_REASON_PRIORITY.length : candidateRank;
  const currentEffective = currentRank === -1 ? ROW_REASON_PRIORITY.length : currentRank;
  return candidateEffective < currentEffective;
}

function otsuThreshold(row: Float32Array): number {
  const histogram = new Array(256).fill(0);
  for (const v of row) histogram[clamp(Math.round(v), 0, 255)] += 1;
  const total = row.length;

  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) sumAll += i * histogram[i];

  let sumB = 0;
  let weightB = 0;
  let bestVariance = -1;
  let bestThreshold = 128;

  for (let i = 0; i < 256; i += 1) {
    weightB += histogram[i];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;

    sumB += i * histogram[i];
    const meanB = sumB / weightB;
    const meanF = (sumAll - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) * (meanB - meanF);

    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = i;
    }
  }

  return bestThreshold;
}

type Run = { color: 0 | 1; length: number };

function toRuns(binary: Uint8Array): Run[] {
  const runs: Run[] = [];
  let start = 0;
  let color = binary[0] as 0 | 1;
  for (let i = 1; i <= binary.length; i += 1) {
    if (i === binary.length || binary[i] !== color) {
      runs.push({ color, length: i - start });
      if (i < binary.length) {
        start = i;
        color = binary[i] as 0 | 1;
      }
    }
  }
  return runs;
}

type GuardCandidate = { runIndex: number; moduleWidth: number };

// Ratio-based match: scale `pattern` so its sum equals the sum of `widths`,
// then compute the mean relative deviation per element. Tolerant of blur and
// fractional module widths, unlike exact bit-string sampling.
function patternError(widths: number[], pattern: number[]): number {
  const widthSum = widths.reduce((a, b) => a + b, 0);
  const patternSum = pattern.reduce((a, b) => a + b, 0);
  if (widthSum <= 0 || patternSum <= 0) return Number.POSITIVE_INFINITY;

  let error = 0;
  for (let i = 0; i < widths.length; i += 1) {
    const scaledPattern = (pattern[i] / patternSum) * widthSum;
    error += Math.abs(widths[i] - scaledPattern) / scaledPattern;
  }
  return error / widths.length;
}

function matchesGuardPattern(widths: number[], pattern: number[], tolerance: number): boolean {
  return patternError(widths, pattern) <= tolerance;
}

// Scan the row for every run-triplet bar/space/bar whose widths are roughly
// equal (a plausible start/end guard), preceded by a sufficiently wide quiet
// zone. Returns candidates ordered by how well they match, so the caller can
// retry several before giving up.
function findStartGuardCandidates(runs: Run[]): GuardCandidate[] {
  const candidates: Array<GuardCandidate & { error: number }> = [];

  for (let i = 1; i < runs.length - 2; i += 1) {
    const a = runs[i];
    const b = runs[i + 1];
    const c = runs[i + 2];
    if (a.color !== 1 || b.color !== 0 || c.color !== 1) continue;

    const widths = [a.length, b.length, c.length];
    const error = patternError(widths, GUARD_WIDTHS);
    if (error > GUARD_MATCH_TOLERANCE) continue;

    const moduleWidth = (widths[0] + widths[1] + widths[2]) / 3;
    const quiet = runs[i - 1];
    if (quiet.color !== 0 || quiet.length < moduleWidth * 1.5) continue;

    candidates.push({ runIndex: i, moduleWidth, error });
  }

  return candidates.sort((x, y) => x.error - y.error);
}

// Used only to distinguish "no guard-shaped triplet at all" from "guard
// shape exists but lacks a quiet zone", for clearer rejection reasons.
function hasAnyGuardShape(runs: Run[]): boolean {
  for (let i = 1; i < runs.length - 2; i += 1) {
    const a = runs[i];
    const b = runs[i + 1];
    const c = runs[i + 2];
    if (a.color !== 1 || b.color !== 0 || c.color !== 1) continue;
    if (patternError([a.length, b.length, c.length], GUARD_WIDTHS) <= GUARD_MATCH_TOLERANCE) return true;
  }
  return false;
}

function matchDigit(widths: number[], tables: Array<{ name: 'L' | 'G'; table: number[][] }>): {
  digit: number;
  parity: 'L' | 'G';
  error: number;
} | null {
  let best: { digit: number; parity: 'L' | 'G'; error: number } | null = null;

  for (const { name, table } of tables) {
    for (let digit = 0; digit < table.length; digit += 1) {
      const error = patternError(widths, table[digit]);
      if (!best || error < best.error) {
        best = { digit, parity: name, error };
      }
    }
  }

  if (!best || best.error > DIGIT_MATCH_TOLERANCE) return null;
  return best;
}

function tryDecodeStructured(
  runs: Run[],
  guard: GuardCandidate,
  leftDigits: number,
  rightDigits: number,
  useParityTable: boolean,
): RowDecodeOutcome {
  let runIndex = guard.runIndex + 3;

  const leftValues: number[] = [];
  const leftParity: number[] = [];

  for (let d = 0; d < leftDigits; d += 1) {
    if (runIndex + 4 > runs.length) return { ok: false, reason: 'digit-group-out-of-bounds' };
    const widths = runs.slice(runIndex, runIndex + 4).map((r) => r.length);
    const match = matchDigit(
      widths,
      useParityTable
        ? [{ name: 'L', table: L_WIDTHS }, { name: 'G', table: G_WIDTHS }]
        : [{ name: 'L', table: L_WIDTHS }],
    );
    if (!match) return { ok: false, reason: 'left-digit-decode-failed' };
    leftValues.push(match.digit);
    leftParity.push(match.parity === 'G' ? 1 : 0);
    runIndex += 4;
  }

  if (runIndex + 5 > runs.length) return { ok: false, reason: 'middle-guard-not-found' };
  const middleWidths = runs.slice(runIndex, runIndex + 5).map((r) => r.length);
  if (!matchesGuardPattern(middleWidths, MIDDLE_WIDTHS, GUARD_MATCH_TOLERANCE)) {
    // A barcode that found a plausible start guard but never finds a middle
    // guard with a dense, irregular run structure is more likely a
    // non-EAN/UPC symbology (e.g. Code128) than a damaged EAN/UPC code.
    const reason = runs.length > 80 ? 'format-not-supported-code128-suspected' : 'middle-guard-not-found';
    return { ok: false, reason };
  }
  runIndex += 5;

  const rightValues: number[] = [];
  for (let d = 0; d < rightDigits; d += 1) {
    if (runIndex + 4 > runs.length) return { ok: false, reason: 'digit-group-out-of-bounds' };
    const widths = runs.slice(runIndex, runIndex + 4).map((r) => r.length);
    const match = matchDigit(widths, [{ name: 'L', table: L_WIDTHS }]);
    if (!match) return { ok: false, reason: 'right-digit-decode-failed' };
    rightValues.push(match.digit);
    runIndex += 4;
  }

  if (runIndex + 3 > runs.length) return { ok: false, reason: 'end-guard-not-found' };
  const endWidths = runs.slice(runIndex, runIndex + 3).map((r) => r.length);
  if (!matchesGuardPattern(endWidths, GUARD_WIDTHS, GUARD_MATCH_TOLERANCE)) {
    return { ok: false, reason: 'end-guard-not-found' };
  }

  if (useParityTable) {
    const leadingDigit = EAN13_PARITY_TABLE.findIndex((pattern) =>
      pattern.every((p, idx) => p === leftParity[idx]),
    );
    if (leadingDigit < 0) return { ok: false, reason: 'middle-guard-not-found' };

    const digits = [leadingDigit, ...leftValues, ...rightValues];
    const value = digits.join('');
    if (!validateEan13Checksum(value)) return { ok: false, reason: 'checksum-invalid' };

    if (leadingDigit === 0) {
      return { ok: true, value: value.slice(1), format: 'UPC_A' };
    }
    return { ok: true, value, format: 'EAN_13' };
  }

  // EAN-8: left digits must all be L-coded (no parity variation allowed).
  if (leftParity.some((p) => p !== 0)) return { ok: false, reason: 'left-digit-decode-failed' };
  const digits = [...leftValues, ...rightValues];
  const value = digits.join('');
  if (!validateModulo10Checksum(value, 8)) return { ok: false, reason: 'checksum-invalid' };
  return { ok: true, value, format: 'EAN_8' };
}

function tryDecodeUpcE(runs: Run[], guard: GuardCandidate): RowDecodeOutcome {
  let runIndex = guard.runIndex + 3;

  const digits: number[] = [];
  let parityBits = 0;

  for (let d = 0; d < 6; d += 1) {
    if (runIndex + 4 > runs.length) return { ok: false, reason: 'digit-group-out-of-bounds' };
    const widths = runs.slice(runIndex, runIndex + 4).map((r) => r.length);
    const match = matchDigit(widths, [
      { name: 'L', table: L_WIDTHS },
      { name: 'G', table: G_WIDTHS },
    ]);
    if (!match) return { ok: false, reason: 'left-digit-decode-failed' };
    digits.push(match.digit);
    parityBits = (parityBits << 1) | (match.parity === 'G' ? 1 : 0);
    runIndex += 4;
  }

  if (runIndex + 6 > runs.length) return { ok: false, reason: 'end-guard-not-found' };
  const endWidths = runs.slice(runIndex, runIndex + 6).map((r) => r.length);
  if (!matchesGuardPattern(endWidths, UPCE_END_WIDTHS, GUARD_MATCH_TOLERANCE)) {
    return { ok: false, reason: 'end-guard-not-found' };
  }

  let numSys: 0 | 1 | null = null;
  let checkDigit = -1;
  const ns0Index = UPCE_NUMSYS0_PATTERNS.indexOf(parityBits);
  if (ns0Index >= 0) {
    numSys = 0;
    checkDigit = ns0Index;
  } else {
    const complement = parityBits ^ 0b111111;
    const ns1Index = UPCE_NUMSYS0_PATTERNS.indexOf(complement);
    if (ns1Index >= 0) {
      numSys = 1;
      checkDigit = ns1Index;
    }
  }

  if (numSys === null) return { ok: false, reason: 'middle-guard-not-found' };

  const expanded = expandUpcE(numSys, digits, checkDigit);
  if (!validateModulo10Checksum(expanded, 12)) return { ok: false, reason: 'checksum-invalid' };

  const value = `${numSys}${digits.join('')}${checkDigit}`;
  return { ok: true, value, format: 'UPC_E' };
}

function expandUpcE(numSys: 0 | 1, digits: number[], checkDigit: number): string {
  const [d1, d2, d3, d4, d5, d6] = digits;
  let manufacturerAndProduct: number[];

  if (d6 <= 2) {
    manufacturerAndProduct = [d1, d2, d6, 0, 0, 0, 0, d3, d4, d5];
  } else if (d6 === 3) {
    manufacturerAndProduct = [d1, d2, d3, 0, 0, 0, 0, 0, d4, d5];
  } else if (d6 === 4) {
    manufacturerAndProduct = [d1, d2, d3, d4, 0, 0, 0, 0, 0, d5];
  } else {
    manufacturerAndProduct = [d1, d2, d3, d4, d5, 0, 0, 0, 0, d6];
  }

  return [numSys, ...manufacturerAndProduct, checkDigit].join('');
}

// ---------------------------------------------------------------------------
// Checksum validation
// ---------------------------------------------------------------------------

function isAllDigits(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

function validateEan13Checksum(value: string): boolean {
  if (!isAllDigits(value) || value.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const digit = Number(value[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(value[12]);
}

function validateModulo10Checksum(value: string, expectedLength: number): boolean {
  if (!isAllDigits(value) || value.length !== expectedLength) return false;
  const checkIndex = expectedLength - 1;
  let sum = 0;
  // UPC-A / EAN-8: odd positions (1-indexed from the right of the payload)
  // weight 3, starting from the rightmost non-check digit.
  for (let i = 0; i < checkIndex; i += 1) {
    const digit = Number(value[i]);
    const positionFromRight = checkIndex - i; // 1-indexed distance from check digit
    const weight = positionFromRight % 2 === 1 ? 3 : 1;
    sum += digit * weight;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(value[checkIndex]);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function smooth(values: Float32Array, radius: number): Float32Array {
  const result = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - radius);
    const end = Math.min(values.length - 1, i + radius);
    for (let j = start; j <= end; j += 1) {
      sum += values[j];
      count += 1;
    }
    result[i] = sum / count;
  }
  return result;
}

function cropToCanvas(gray: GrayImage, rect: RectPx): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = get2d(canvas);
  context.drawImage(gray.canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return canvas;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = get2d(canvas);
  context.drawImage(source, 0, 0);
  return canvas;
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D context is not available.');
  return context;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
