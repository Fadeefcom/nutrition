# Barcode Photo Demo

Small React/Vite demo for testing barcode detection from image files only.

## Run

```powershell
npm install
npm run dev
```

Open the browser console and upload or drag a photo. Useful logs are prefixed with:

```text
[PhotoBarcodeDemo]
```

The app tries ZXing plus native `BarcodeDetector` when available. It tests multiple crops, rotations, and preprocessing modes, then prints the detected value to the page and console.
