import type { APIContext } from 'astro';
import { verifyAdminCookie } from '../../../lib/adminAuth';

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

  const takenAt = type === 'photo' ? dateRaw : null;
  const eventDate = type === 'poster' ? dateRaw : null;

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
  await env.IMAGES.put(r2Key, arrayBuffer, {
    httpMetadata: { contentType },
  });

  await env.DB.prepare(
    'INSERT INTO images (id, r2_key, type, taken_at, event_date, date_precision, caption, credit, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, r2Key, type, takenAt, eventDate, datePrecision, caption, credit, location).run();

  return Response.json({ id, r2_key: r2Key });
}
