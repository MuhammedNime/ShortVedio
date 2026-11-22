interface AndroidNativeBridgeApi {
  requestAudioPermission?: () => boolean;
  saveFile?: (base64Data: string, fileName: string, mimeType: string) => string;
  shareFile?: (base64Data: string, fileName: string, mimeType: string) => string;
}

function getAndroidBridge(): AndroidNativeBridgeApi | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AndroidNativeBridge?: AndroidNativeBridgeApi };
  return w.AndroidNativeBridge ?? null;
}

export function isAndroidNativeApp(): boolean {
  return Boolean(getAndroidBridge()?.saveFile);
}

export function canShareNatively(fileName: string, mimeType: string, blob: Blob): boolean {
  if (getAndroidBridge()?.shareFile) return true;
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      const testFile = new File([blob], fileName, { type: mimeType });
      return navigator.canShare({ files: [testFile] });
    } catch {
      return false;
    }
  }
  return false;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

export async function saveOrDownloadBlob(
  blob: Blob,
  fileName: string,
  mimeType?: string
): Promise<{ savedNatively: boolean; ok: boolean; error?: string }> {
  const bridge = getAndroidBridge();
  if (bridge?.saveFile) {
    const base64 = await blobToBase64(blob);
    const raw = bridge.saveFile(base64, fileName, mimeType || blob.type || 'application/octet-stream');
    try {
      const parsed = JSON.parse(raw) as { ok?: boolean; error?: string };
      return {
        savedNatively: true,
        ok: Boolean(parsed.ok),
        error: parsed.error,
      };
    } catch {
      return { savedNatively: true, ok: true };
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { savedNatively: false, ok: true };
}

export async function shareBlobNatively(
  blob: Blob,
  fileName: string,
  mimeType: string,
  title = 'فيديو شورتس الأسئلة'
): Promise<boolean> {
  const bridge = getAndroidBridge();
  if (bridge?.shareFile) {
    const base64 = await blobToBase64(blob);
    const raw = bridge.shareFile(base64, fileName, mimeType || blob.type || 'application/octet-stream');
    try {
      const parsed = JSON.parse(raw) as { ok?: boolean };
      return Boolean(parsed.ok);
    } catch {
      return true;
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const file = new File([blob], fileName, { type: mimeType });
    await navigator.share({ title, files: [file] });
    return true;
  }
  return false;
}
