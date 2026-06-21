export type BarcodePreprocessMeta = {
  angle: number;
  score: number;
  centerSquare: Rect;
  crop: Rect;
  outputWidth: number;
  outputHeight: number;
};

export type BarcodePreprocessResult = {
  canvas: HTMLCanvasElement;
  meta: BarcodePreprocessMeta;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AngleCandidate = {
  angle: number;
  score: number;
  canvas: HTMLCanvasElement;
  band: Rect;
};

const maxAnalysisSide = 1100;
const scanAngles = [
  0,
  -2,
  2,
  -4,
  4,
  -6,
  6,
  -8,
  8,
  -10,
  10,
  -12,
  12,
  -15,
  15,
  -18,
  18,
  -22,
  22,
  -26,
  26,
  -30,
  30,
  -35,
  35,
  -40,
  40,
];

export function createCenteredBarcodeCandidate(sourceCanvas: HTMLCanvasElement): BarcodePreprocessResult | null {
  const centerSquare = getCenterSquare(sourceCanvas);
  const analysisSide = Math.max(240, Math.min(maxAnalysisSide, centerSquare.width));
  let best: AngleCandidate | null = null;

  for (const angle of scanAngles) {
    const rotated = renderRotatedSquare(sourceCanvas, centerSquare, analysisSide, angle);
    const analyzed = analyzeBarcodeBand(rotated, angle);

    if (!best || analyzed.score > best.score) {
      best = analyzed;
    }
  }

  if (!best || best.score < 18) {
    return null;
  }

  const paddedCrop = padRect(best.band, best.canvas.width, best.canvas.height, 0.18, 0.45);
  const output = cropToCanvas(best.canvas, paddedCrop, 1.8);

  return {
    canvas: output,
    meta: {
      angle: best.angle,
      score: Math.round(best.score * 100) / 100,
      centerSquare,
      crop: paddedCrop,
      outputWidth: output.width,
      outputHeight: output.height,
    },
  };
}

function getCenterSquare(canvas: HTMLCanvasElement): Rect {
  const side = Math.round(Math.min(canvas.width, canvas.height) * 0.92);
  return {
    x: Math.round((canvas.width - side) / 2),
    y: Math.round((canvas.height - side) / 2),
    width: side,
    height: side,
  };
}

function renderRotatedSquare(
  sourceCanvas: HTMLCanvasElement,
  crop: Rect,
  size: number,
  angle: number,
) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = get2d(canvas);

  context.fillStyle = '#fff';
  context.fillRect(0, 0, size, size);
  context.save();
  context.translate(size / 2, size / 2);
  context.rotate((angle * Math.PI) / 180);
  context.imageSmoothingEnabled = true;
  context.drawImage(
    sourceCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  context.restore();

  return canvas;
}

function analyzeBarcodeBand(canvas: HTMLCanvasElement, angle: number): AngleCandidate {
  const context = get2d(canvas);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const rowEnergy = new Float32Array(canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    let energy = 0;
    let previous = luminanceAt(image.data, y * canvas.width * 4);

    for (let x = 1; x < canvas.width; x += 1) {
      const current = luminanceAt(image.data, (y * canvas.width + x) * 4);
      const diff = Math.abs(current - previous);
      if (diff > 18) energy += diff;
      previous = current;
    }

    rowEnergy[y] = energy / canvas.width;
  }

  const smoothRows = smooth(rowEnergy, 8);
  const bandY = findStrongRange(smoothRows, 0.34, Math.round(canvas.height * 0.08), Math.round(canvas.height * 0.7));
  const band = findColumnRange(canvas, image.data, bandY);
  const score = scoreBand(canvas, image.data, band);

  return { angle, score, canvas, band };
}

function findColumnRange(canvas: HTMLCanvasElement, data: Uint8ClampedArray, rows: { start: number; end: number }): Rect {
  const colEnergy = new Float32Array(canvas.width);
  const startY = clamp(rows.start, 0, canvas.height - 1);
  const endY = clamp(rows.end, startY + 1, canvas.height);

  for (let x = 1; x < canvas.width; x += 1) {
    let energy = 0;

    for (let y = startY; y < endY; y += 1) {
      const left = luminanceAt(data, (y * canvas.width + x - 1) * 4);
      const current = luminanceAt(data, (y * canvas.width + x) * 4);
      const diff = Math.abs(current - left);
      if (diff > 18) energy += diff;
    }

    colEnergy[x] = energy / (endY - startY);
  }

  const smoothCols = smooth(colEnergy, 10);
  const cols = findStrongRange(smoothCols, 0.24, Math.round(canvas.width * 0.18), Math.round(canvas.width * 0.9));

  return {
    x: cols.start,
    y: startY,
    width: cols.end - cols.start,
    height: endY - startY,
  };
}

function scoreBand(canvas: HTMLCanvasElement, data: Uint8ClampedArray, band: Rect) {
  let edgeEnergy = 0;
  let transitions = 0;
  const startX = clamp(band.x, 1, canvas.width - 1);
  const endX = clamp(band.x + band.width, startX + 1, canvas.width);
  const startY = clamp(band.y, 0, canvas.height - 1);
  const endY = clamp(band.y + band.height, startY + 1, canvas.height);

  for (let y = startY; y < endY; y += 2) {
    let previous = luminanceAt(data, (y * canvas.width + startX - 1) * 4);

    for (let x = startX; x < endX; x += 1) {
      const current = luminanceAt(data, (y * canvas.width + x) * 4);
      const diff = Math.abs(current - previous);
      if (diff > 24) {
        edgeEnergy += diff;
        transitions += 1;
      }
      previous = current;
    }
  }

  const area = Math.max(1, (endX - startX) * ((endY - startY) / 2));
  const transitionDensity = transitions / area;
  return (edgeEnergy / area) * (1 + Math.min(2, transitionDensity * 80));
}

function findStrongRange(values: Float32Array, thresholdRatio: number, minSize: number, maxSize: number) {
  let max = 0;
  let sum = 0;

  for (const value of values) {
    max = Math.max(max, value);
    sum += value;
  }

  const mean = sum / Math.max(1, values.length);
  const threshold = mean + (max - mean) * thresholdRatio;
  let peak = 0;

  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[peak]) peak = index;
  }

  let start = peak;
  let end = peak + 1;

  while (start > 0 && values[start - 1] >= threshold) start -= 1;
  while (end < values.length && values[end] >= threshold) end += 1;

  if (end - start < minSize) {
    const extra = Math.round((minSize - (end - start)) / 2);
    start = clamp(start - extra, 0, values.length - minSize);
    end = start + minSize;
  }

  if (end - start > maxSize) {
    const center = Math.round((start + end) / 2);
    start = clamp(Math.round(center - maxSize / 2), 0, values.length - maxSize);
    end = start + maxSize;
  }

  return { start, end };
}

function padRect(rect: Rect, maxWidth: number, maxHeight: number, padXRatio: number, padYRatio: number): Rect {
  const padX = Math.round(rect.width * padXRatio);
  const padY = Math.round(rect.height * padYRatio);
  const x = clamp(rect.x - padX, 0, maxWidth - 1);
  const y = clamp(rect.y - padY, 0, maxHeight - 1);
  const right = clamp(rect.x + rect.width + padX, x + 1, maxWidth);
  const bottom = clamp(rect.y + rect.height + padY, y + 1, maxHeight);

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

function cropToCanvas(sourceCanvas: HTMLCanvasElement, crop: Rect, scale: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(crop.width * scale));
  canvas.height = Math.max(1, Math.round(crop.height * scale));
  const context = get2d(canvas);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(
    sourceCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

function smooth(values: Float32Array, radius: number) {
  const result = new Float32Array(values.length);

  for (let index = 0; index < values.length; index += 1) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);

    for (let sample = start; sample <= end; sample += 1) {
      sum += values[sample];
      count += 1;
    }

    result[index] = sum / count;
  }

  return result;
}

function luminanceAt(data: Uint8ClampedArray, offset: number) {
  return data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
}

function get2d(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D context is not available.');
  return context;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
