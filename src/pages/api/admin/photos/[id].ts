import type { APIContext } from 'astro';
import { verifyAdminCookie } from '../../../../lib/adminAuth';

export async function PUT(context: APIContext): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (context.locals as any).runtime?.env;
  if (!env) return new Response('Server error', { status: 500 });
  if (!await verifyAdminCookie(context.request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = context.params;
  if (!id) return new Response('Missing id', { status: 400 });

  const body = await context.request.json() as {
    type?: string;
    caption?: string;
    date?: string;
    date_precision?: string;
    location?: string;
    credit?: string;
  };

  const type = body.type ?? 'photo';
  const caption = body.caption?.trim() || null;
  const dateRaw = body.date?.trim() || null;
  const datePrecision = body.date_precision ?? 'day';
  const location = body.location?.trim() || null;
  const credit = body.credit?.trim() || null;

  const takenAt = null;
  const eventDate = dateRaw;

  const result = await env.DB.prepare(
    `UPDATE images SET type = ?, caption = ?, taken_at = ?, event_date = ?, date_precision = ?, location = ?, credit = ? WHERE id = ?`
  ).bind(type, caption, takenAt, eventDate, datePrecision, location, credit, id).run();

  if (result.changes === 0) return new Response('Not found', { status: 404 });
  return new Response('OK');
}

export async function DELETE(context: APIContext): Promise<Response> {
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

  await env.IMAGES.delete(row.r2_key);
  await env.DB.prepare('DELETE FROM images WHERE id = ?').bind(id).run();

  return new Response('OK');
}
