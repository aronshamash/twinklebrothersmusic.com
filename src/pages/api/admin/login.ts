import type { APIContext } from 'astro';
import { createAdminToken, timingSafeEqual, ADMIN_SESSION_LIFETIME_MS } from '../../../lib/adminAuth';

type KVStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

const RATE_LIMIT_THRESHOLD = 5;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60; // 15 minutes

export async function POST(context: APIContext): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (context.locals as any).runtime?.env;

  if (!env?.ADMIN_PASSWORD || !env?.ADMIN_SECRET) {
    return new Response('Server misconfigured', { status: 500 });
  }

  // Reuse the existing Discogs cache KV namespace for login-attempt tracking
  // (avoids provisioning a dedicated KV namespace for a single admin user).
  const kv: KVStore | undefined = env.DISCOGS_CACHE;
  const ip = context.request.headers.get('CF-Connecting-IP')
    ?? context.request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    ?? 'unknown';
  const attemptsKey = `login-attempts:${ip}`;

  let attempts = 0;
  if (kv) {
    attempts = Number(await kv.get(attemptsKey)) || 0;
    if (attempts >= RATE_LIMIT_THRESHOLD) {
      return new Response(null, {
        status: 303,
        headers: { Location: '/admin?error=ratelimited' },
      });
    }
  }

  const formData = await context.request.formData();
  const password = formData.get('password') as string | null;

  if (!password || !timingSafeEqual(password, env.ADMIN_PASSWORD)) {
    if (kv) {
      await kv.put(attemptsKey, String(attempts + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
    }
    return new Response(null, {
      status: 303,
      headers: { Location: '/admin?error=1' },
    });
  }

  if (kv) {
    await kv.delete(attemptsKey);
  }

  const token = await createAdminToken(env);
  const secure = context.request.url.startsWith('https') ? '; Secure' : '';
  const maxAge = Math.floor(ADMIN_SESSION_LIFETIME_MS / 1000);

  return new Response(null, {
    status: 303,
    headers: {
      Location: '/admin/upload',
      'Set-Cookie': `admin_token=${token}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=${maxAge}`,
    },
  });
}
