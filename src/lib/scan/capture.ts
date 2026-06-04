import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

/**
 * True only where a real camera scanner exists (native device). Web/dev → false,
 * so the UI can hide the scan affordance and fall back to manual entry gracefully.
 */
export async function isScanAvailable(): Promise<boolean> {
  try {
    const { supported } = await BarcodeScanner.isSupported();
    return supported;
  } catch {
    return false;
  }
}

/**
 * Trigger a scan and return the first barcode's raw value, or null if unavailable,
 * permission denied, or cancelled. Never throws — the caller treats null as "no scan".
 */
export async function scanBarcode(): Promise<string | null> {
  try {
    if (!(await isScanAvailable())) return null;
    const perm = await BarcodeScanner.requestPermissions();
    if (perm.camera !== 'granted' && perm.camera !== 'limited') return null;
    const { barcodes } = await BarcodeScanner.scan();
    return barcodes[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}
