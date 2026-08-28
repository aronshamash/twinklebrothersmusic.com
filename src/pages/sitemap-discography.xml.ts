import type { APIRoute } from 'astro';
import { getAllImages } from '../lib/db';

const SITE = 'https://twinklebrothersmusic.com';

export const GET: APIRoute = async ({ locals }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (locals as any).runtime?.env;

  let urls: string[] = [];

  if (env) {
    try {
      const [releasesResult, images] = await Promise.all([
        env.DB.prepare(
          `SELECT r.id FROM discography_releases r
           LEFT JOIN discography_exclusions e ON e.release_id = r.id
           WHERE e.release_id IS NULL`
        ).all(),
        getAllImages(env),
      ]);

      const releaseIds = (releasesResult.results ?? []) as { id: number }[];

      urls = [
        ...releaseIds.map((row) => `${SITE}/discography/${row.id}`),
        ...images.map((image) => `${SITE}/image/${image.id}`),
      ];
    } catch (err) {
      console.error('sitemap-discography query failed:', err);
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((url) => `<url><loc>${url}</loc></url>`)
    .join('')}</urlset>`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
