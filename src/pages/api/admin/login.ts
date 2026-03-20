import type { APIContext } from 'astro';
import { createAdminToken } from '../../../lib/adminAuth';

export async function POST(context: APIContext): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (context.locals as any).runtime?.env;

  if (!env?.ADMIN_PASSWORD || !env?.ADMIN_SECRET) {
    return new Response('Server misconfigured', { status: 500 });
  }

  const formData = await context.request.formData();
  const password = formData.get('password') as string | null;

  if (!password || password !== env.ADMIN_PASSWORD) {
    return new Response(null, {
      status: 303,
      headers: { Location: '/admin?error=1' },
    });
  }

  const token = await createAdminToken(env);
  const secure = context.request.url.startsWith('https') ? '; Secure' : '';

  return new Response(null, {
    status: 303,
    headers: {
      Location: '/admin/upload',
      'Set-Cookie': `admin_token=${token}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=86400`,
    },
  });
}
