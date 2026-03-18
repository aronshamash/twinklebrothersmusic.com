import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals }) => {
  const key = params.path;
  if (!key) return new Response('Not found', { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (locals as any).runtime?.env;
  if (!env?.IMAGES) {
    return new Response('Storage not available', { status: 503 });
  }

  const object = await env.IMAGES.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
