export interface AdminEnv {
  ADMIN_PASSWORD: string;
  ADMIN_SECRET: string;
}

export const ADMIN_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24h, matches cookie Max-Age

async function computeSignature(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createAdminToken(env: AdminEnv): Promise<string> {
  const timestamp = Date.now();
  const signature = await computeSignature(`${timestamp}:${env.ADMIN_PASSWORD}`, env.ADMIN_SECRET);
  return `${timestamp}.${signature}`;
}

export async function verifyAdminCookie(request: Request, env: AdminEnv): Promise<boolean> {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SECRET) return false;
  const cookieHeader = request.headers.get('Cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)admin_token=([^;]+)/);
  if (!match) return false;

  const [timestampStr, signature] = match[1].split('.');
  if (!timestampStr || !signature) return false;

  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > ADMIN_SESSION_LIFETIME_MS) return false;

  const expected = await computeSignature(`${timestamp}:${env.ADMIN_PASSWORD}`, env.ADMIN_SECRET);
  return timingSafeEqual(signature, expected);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
