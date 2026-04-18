export interface DetectedImageFormat {
  extension: string;
  mediaType: string;
  supportedByClaude: boolean;
  label: string;
}

const FORMATS: Record<string, DetectedImageFormat> = {
  jpeg: { extension: '.jpg', mediaType: 'image/jpeg', supportedByClaude: true, label: 'JPEG' },
  png: { extension: '.png', mediaType: 'image/png', supportedByClaude: true, label: 'PNG' },
  webp: { extension: '.webp', mediaType: 'image/webp', supportedByClaude: true, label: 'WebP' },
  gif: { extension: '.gif', mediaType: 'image/gif', supportedByClaude: true, label: 'GIF' },
  tiff: { extension: '.tiff', mediaType: 'image/tiff', supportedByClaude: false, label: 'TIFF' },
  heic: { extension: '.heic', mediaType: 'image/heic', supportedByClaude: false, label: 'HEIC' },
  heif: { extension: '.heif', mediaType: 'image/heif', supportedByClaude: false, label: 'HEIF' },
  avif: { extension: '.avif', mediaType: 'image/avif', supportedByClaude: false, label: 'AVIF' },
};

function hasBoxSignature(bytes: Uint8Array, brand: string): boolean {
  if (bytes.length < 12) return false;
  return String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp'
    && String.fromCharCode(...bytes.slice(8, 12)) === brand;
}

export function detectImageFormat(bytes: Uint8Array): DetectedImageFormat | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8) return FORMATS.jpeg;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return FORMATS.png;
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return FORMATS.webp;
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return FORMATS.gif;
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  ) {
    return FORMATS.tiff;
  }
  if (hasBoxSignature(bytes, 'heic') || hasBoxSignature(bytes, 'heix') || hasBoxSignature(bytes, 'hevc') || hasBoxSignature(bytes, 'hevx')) {
    return FORMATS.heic;
  }
  if (hasBoxSignature(bytes, 'mif1') || hasBoxSignature(bytes, 'heif')) {
    return FORMATS.heif;
  }
  if (hasBoxSignature(bytes, 'avif')) {
    return FORMATS.avif;
  }

  return null;
}
