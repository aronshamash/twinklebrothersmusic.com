export interface Image {
  id: string;
  r2_key: string;
  type: string;
  taken_at: string | null;
  event_date: string | null;
  date_precision: 'year' | 'month' | 'day' | 'decade' | null;
  caption: string | null;
  credit: string | null;
  location: string | null;
  width: number | null;
  height: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Env = { DB: any };

export async function getAllImages(env: Env): Promise<Image[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM images ORDER BY COALESCE(event_date, taken_at) ASC`
  ).all();
  return (result.results ?? []) as Image[];
}

export async function getImagesByType(env: Env, type: string): Promise<Image[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM images WHERE type = ?
     ORDER BY
       CASE
         WHEN NULLIF(event_date, '') IS NOT NULL THEN
           CASE WHEN LENGTH(event_date) = 4 THEN event_date || '-01-01'
                WHEN LENGTH(event_date) = 7 THEN event_date || '-01'
                ELSE event_date END
         WHEN NULLIF(taken_at, '') IS NOT NULL THEN
           CASE WHEN LENGTH(taken_at) = 4 THEN taken_at || '-01-01'
                WHEN LENGTH(taken_at) = 7 THEN taken_at || '-01'
                ELSE taken_at END
         ELSE '9999-12-31'
       END ASC`
  ).bind(type).all();
  return (result.results ?? []) as Image[];
}

export async function getImageById(env: Env, id: string): Promise<Image | null> {
  const result = await env.DB.prepare(
    `SELECT * FROM images WHERE id = ?`
  ).bind(id).first();
  return result as Image | null;
}

export async function getAdjacentImages(
  env: Env,
  image: Image,
  typeFilter?: string | null
): Promise<{ prev: string | null; next: string | null }> {
  const dateExpr = `COALESCE(event_date, taken_at)`;
  const currentDate = image.event_date ?? image.taken_at;
  const typeClause = typeFilter ? ` AND type = '${typeFilter.replace(/'/g, "''")}'` : '';

  const [prevResult, nextResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id FROM images WHERE (${dateExpr} < ? OR (${dateExpr} = ? AND id < ?))${typeClause}
       ORDER BY ${dateExpr} DESC, id DESC LIMIT 1`
    ).bind(currentDate, currentDate, image.id).first(),
    env.DB.prepare(
      `SELECT id FROM images WHERE (${dateExpr} > ? OR (${dateExpr} = ? AND id > ?))${typeClause}
       ORDER BY ${dateExpr} ASC, id ASC LIMIT 1`
    ).bind(currentDate, currentDate, image.id).first(),
  ]);

  return {
    prev: (prevResult as { id: string } | null)?.id ?? null,
    next: (nextResult as { id: string } | null)?.id ?? null,
  };
}

export function imageDate(image: Image): string | null {
  return image.event_date ?? image.taken_at;
}

export function formatImageDate(image: Image): string {
  const dateStr = imageDate(image);
  if (!dateStr) return '';
  const precision = image.date_precision ?? 'day';
  const date = new Date(dateStr + 'T00:00:00');
  if (precision === 'decade') return Math.floor(date.getFullYear() / 10) * 10 + 's';
  if (precision === 'year') return date.getFullYear().toString();
  if (precision === 'month') return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long' });
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
}
