import type { APIContext } from 'astro';

export async function GET(_context: APIContext): Promise<Response> {
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/admin',
      'Set-Cookie': 'admin_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    },
  });
}
