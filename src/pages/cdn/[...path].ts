import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals }) => {
  const key = params.path;
  if (!key) return new Response('Not found', { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (locals as any).runtime?.env;
  if (!env?.IMAGES) {
    return new Response('Storage not available', { status: 503 });
  }

  let object = await env.IMAGES.get(key);

  // Thumbnail fallback: if the thumb doesn't exist yet, serve the original
  if (!object && key.endsWith('-thumb.webp')) {
    const base = key.slice(0, -'-thumb.webp'.length);
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tiff']) {
      object = await env.IMAGES.get(base + ext);
      if (object) break;
    }
  }

  if (!object) return new Response('Not found', { status: 404 });

  const etag = object.etag ? `"${object.etag}"` : null;
  const headers: Record<string, string> = {
    'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000',
  };
  if (etag) headers['ETag'] = etag;

  return new Response(object.body, { headers });
};
