import type { APIContext } from 'astro';
import { verifyAdminCookie } from '../../../../../lib/adminAuth';

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

  const { id } = context.params;
  if (!id) return new Response('Missing id', { status: 400 });

  const row = await env.DB.prepare('SELECT r2_key FROM images WHERE id = ?').bind(id).first() as { r2_key: string } | null;
  if (!row) return new Response('Not found', { status: 404 });

  const formData = await context.request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return new Response('Missing file', { status: 400 });

  const extMatch = file.name.match(/\.[^.]+$/);
  const ext = (extMatch ? extMatch[0] : '.jpg').toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? 'image/jpeg';

  const arrayBuffer = await file.arrayBuffer();

  // Overwrite the same R2 key — URL stays the same, no D1 update needed
  await env.IMAGES.put(row.r2_key, arrayBuffer, {
    httpMetadata: { contentType },
  });

  return new Response('OK');
}
