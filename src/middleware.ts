import type { MiddlewareHandler } from 'astro';

const TRAILING_SLASH_REDIRECTS: Record<string, string> = {
  '/discography/': '/discography',
  '/history/': '/history',
};

export const onRequest: MiddlewareHandler = async (context, next) => {
  const canonicalPath = TRAILING_SLASH_REDIRECTS[context.url.pathname];
  if (canonicalPath) {
    return context.redirect(canonicalPath, 301);
  }

  const response = await next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://sheets.googleapis.com; frame-src https://www.youtube.com https://bandcamp.com https://open.spotify.com; media-src 'self'"
  );

  if (response.headers.get('content-type')?.startsWith('text/html')) {
    response.headers.set('Content-Type', 'text/html; charset=utf-8');
  }

  return response;
};
