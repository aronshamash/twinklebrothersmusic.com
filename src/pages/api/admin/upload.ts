import type { APIContext } from 'astro';
import { verifyAdminCookie } from '../../../lib/adminAuth';

function getImageDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  const b = new Uint8Array(buffer);
  // PNG: signature bytes 0-7, IHDR chunk starts at byte 8, width at 16, height at 20
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const width = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
    const height = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
    return { width, height };
  }
  // JPEG: scan for SOF0/SOF2 markers (FF C0, FF C2)
  if (b[0] === 0xff && b[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < b.length) {
      if (b[offset] !== 0xff) break;
      const marker = b[offset + 1];
      const segLen = (b[offset + 2] << 8) | b[offset + 3];
      if (marker === 0xc0 || marker === 0xc2) {
        const height = (b[offset + 5] << 8) | b[offset + 6];
        const width = (b[offset + 7] << 8) | b[offset + 8];
        return { width, height };
      }
      offset += 2 + segLen;
    }
    return null;
  }
  // WebP: RIFF....WEBP VP8 /VP8L/VP8X
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const chunkId = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunkId === 'VP8 ') {
      // Lossy: bitstream starts at byte 20; width/height encoded as 14-bit at specific offsets
      const w = ((b[26] | (b[27] << 8)) & 0x3fff) + 1;
      const h = ((b[28] | (b[29] << 8)) & 0x3fff) + 1;
      return { width: w, height: h };
    }
    if (chunkId === 'VP8L') {
      // Lossless: 4 bytes after signature encode width-1 (14 bits) and height-1 (14 bits)
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return { width, height };
    }
    if (chunkId === 'VP8X') {
      // Extended: canvas width-1 as 24-bit LE at offset 24, height-1 at offset 27
      const width = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
      const height = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
      return { width, height };
    }
  }
  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
};

export async function POST(context: APIContext): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (context.locals as any).runtime?.env;

  if (!env) return new Response('Server error', { status: 500 });
  if (!await verifyAdminCookie(context.request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const formData = await context.request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return new Response('Missing file', { status: 400 });

  const type = (formData.get('type') as string | null) ?? 'photo';
  const caption = (formData.get('caption') as string | null) || null;
  const dateRaw = (formData.get('date') as string | null) || null;
  const datePrecision = (formData.get('date_precision') as string | null) || 'day';
  const location = (formData.get('location') as string | null) || null;
  const credit = (formData.get('credit') as string | null) || null;

  const takenAt = null;
  const eventDate = dateRaw;

  const id = crypto.randomUUID();
  const extMatch = file.name.match(/\.[^.]+$/);
  const ext = (extMatch ? extMatch[0] : '.jpg').toLowerCase();
  const safeBase = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .slice(0, 60);
  const r2Key = `${safeBase}-${id.slice(0, 8)}${ext}`;
  const contentType = CONTENT_TYPES[ext] ?? 'image/jpeg';

  const arrayBuffer = await file.arrayBuffer();
  const dims = getImageDimensions(arrayBuffer);
  await env.IMAGES.put(r2Key, arrayBuffer, {
    httpMetadata: { contentType },
  });

  await env.DB.prepare(
    'INSERT INTO images (id, r2_key, type, taken_at, event_date, date_precision, caption, credit, location, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, r2Key, type, takenAt, eventDate, datePrecision, caption, credit, location, dims?.width ?? null, dims?.height ?? null).run();

  return Response.json({ id, r2_key: r2Key });
}
