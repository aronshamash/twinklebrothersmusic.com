/**
 * Sync Discogs discography into D1 for fast list-page rendering.
 *
 * Usage:
 *   pnpm sync-discography                        # skip if synced within last 7 days
 *   pnpm sync-discography --force                # always re-fetch and upsert all
 *   pnpm sync-discography:local --force          # same, against local Wrangler D1
 *   pnpm sync-discography --set-image --id 123 --url https://...  # override cover image
 *   pnpm sync-discography:local --set-image --id 123 --url https://...
 *
 * Required env vars (.env):
 *   DISCOGS_TOKEN, DISCOGS_ARTIST_ID
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// --- Load .env ---
function loadEnv() {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

// --- CLI args ---
const { values: args } = parseArgs({
  options: {
    force:          { type: 'boolean', default: false },
    'set-image':    { type: 'boolean', default: false },
    'set-release':  { type: 'boolean', default: false },
    'fetch-covers': { type: 'boolean', default: false },
    id:             { type: 'string' },
    url:            { type: 'string' },
    release:        { type: 'string' },
    local:          { type: 'boolean', default: false },
  },
});

const isLocal = args.local ?? false;
const localFlag = isLocal ? ' --local' : ' --remote';

// --- D1 helper: run a SQL string via wrangler ---
function executeSQL(sql: string): void {
  const tmpFile = join(tmpdir(), `discography-${randomUUID()}.sql`);
  writeFileSync(tmpFile, sql, 'utf-8');
  try {
    execSync(`pnpm wrangler d1 execute DB --file "${tmpFile}"${localFlag}`, { stdio: 'inherit' });
  } finally {
    unlinkSync(tmpFile);
  }
}

// --- D1 helper: run a query and capture JSON output ---
function queryD1(sql: string): unknown[] {
  const output = execSync(
    `pnpm wrangler d1 execute DB --command "${sql.replace(/"/g, '\\"')}"${localFlag} --json`,
    { encoding: 'utf-8' }
  );
  try {
    const parsed = JSON.parse(output);
    return parsed?.[0]?.results ?? [];
  } catch {
    return [];
  }
}

// --- Discogs types (Node.js subset — mirrors src/lib/discogs.ts without import.meta.env) ---
interface DiscogsApiRelease {
  id: number;
  title: string;
  year?: number;
  label?: string;
  thumb?: string;
  cover_image?: string;
  type: string;
  role: string;
  format?: string;
  master_id?: number;
}

interface DiscogsApiResponse {
  releases: DiscogsApiRelease[];
  pagination: { pages: number; page: number };
}

interface DiscogsRelease {
  id: number;
  master_id?: number;
  title: string;
  year: number;
  label: string;
  thumb: string;
  cover_image: string;
  format: string;
  release_type: 'master' | 'release';
}

function formatScore(fmt: string): number {
  const f = fmt.toLowerCase();
  if (f.includes('album')) return 4;
  if (f.includes('lp')) return 3;
  if (f.includes('cd')) return 2;
  if (f.includes('ep') || f.includes('mini')) return 1;
  return 0;
}

const DISCOGS_HEADERS = {
  Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
  'User-Agent': 'twinklebrothersmusic.com/1.0',
};

async function fetchAllReleases(): Promise<DiscogsRelease[]> {
  const token = process.env.DISCOGS_TOKEN;
  const artistId = process.env.DISCOGS_ARTIST_ID;

  if (!token || !artistId) {
    console.error('Error: DISCOGS_TOKEN and DISCOGS_ARTIST_ID must be set in .env');
    process.exit(1);
  }

  const masterEntries = new Map<number, DiscogsApiRelease>();
  const releaseBuckets = new Map<number, DiscogsApiRelease[]>();
  const standalones: DiscogsApiRelease[] = [];
  const standaloneIds = new Set<number>();

  const artistIds = [artistId, '370148']; // Twinkle Brothers + Norman Grant

  for (const aid of artistIds) {
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const url = `https://api.discogs.com/artists/${aid}/releases?sort=year&sort_order=asc&per_page=100&page=${page}`;
      const response = await fetch(url, { headers: DISCOGS_HEADERS });

      if (!response.ok) {
        console.error(`Discogs API error (artist ${aid}): ${response.status} ${response.statusText}`);
        break;
      }

      const data: DiscogsApiResponse = await response.json();
      totalPages = data.pagination.pages;

      for (const release of data.releases) {
        if (release.role !== 'Main') continue;
        if (release.type === 'master') {
          if (!masterEntries.has(release.id)) masterEntries.set(release.id, release);
        } else if (release.master_id) {
          if (!releaseBuckets.has(release.master_id)) releaseBuckets.set(release.master_id, []);
          releaseBuckets.get(release.master_id)!.push(release);
        } else if (!standaloneIds.has(release.id)) {
          standalones.push(release);
          standaloneIds.add(release.id);
        }
      }

      page++;
    }
  }

  const releases: DiscogsRelease[] = [];

  for (const [masterId, masterEntry] of masterEntries) {
    const bucket = releaseBuckets.get(masterId);
    if (bucket?.length) {
      const best = bucket.reduce((prev, curr) =>
        formatScore(curr.format ?? '') > formatScore(prev.format ?? '') ? curr : prev
      );
      releases.push({
        id: best.id,
        master_id: masterId,
        title: best.title,
        year: best.year ?? 0,
        label: best.label ?? '',
        thumb: best.thumb ?? '',
        cover_image: best.cover_image ?? best.thumb ?? '',
        format: best.format ?? '',
        release_type: 'release',
      });
    } else {
      releases.push({
        id: masterEntry.id,
        master_id: masterId,
        title: masterEntry.title,
        year: masterEntry.year ?? 0,
        label: masterEntry.label ?? '',
        thumb: masterEntry.thumb ?? '',
        cover_image: masterEntry.cover_image ?? masterEntry.thumb ?? '',
        format: masterEntry.format ?? '',
        release_type: 'master',
      });
    }
  }

  for (const release of standalones) {
    releases.push({
      id: release.id,
      title: release.title,
      year: release.year ?? 0,
      label: release.label ?? '',
      thumb: release.thumb ?? '',
      cover_image: release.cover_image ?? release.thumb ?? '',
      format: release.format ?? '',
      release_type: 'release',
    });
  }

  releases.sort((a, b) => (a.year || 9999) - (b.year || 9999));
  return releases;
}

// --- Escape single quotes for SQL ---
function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

// ============================================================
// Main
// ============================================================

if (args['set-release']) {
  // --- Preferred release override mode ---
  // Usage: --set-release --id <release_id_in_d1> --release <preferred_discogs_release_id>
  const releaseId = args.id ? parseInt(args.id, 10) : NaN;
  const preferredId = args.release ? parseInt(args.release, 10) : NaN;
  if (isNaN(releaseId) || isNaN(preferredId)) {
    console.error('Usage: --set-release --id <release_id_in_d1> --release <preferred_discogs_release_id>');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const sql = `INSERT OR REPLACE INTO discography_release_overrides (release_id, preferred_release_id, updated_at) VALUES (${releaseId}, ${preferredId}, ${esc(now)});`;

  console.log(`Setting preferred release for ${releaseId} → ${preferredId}...`);
  executeSQL(sql);
  console.log('Done.');

} else if (args['set-image']) {
  // --- Image override mode ---
  const releaseId = args.id ? parseInt(args.id, 10) : NaN;
  if (isNaN(releaseId) || !args.url) {
    console.error('Usage: --set-image --id <release_id> --url <image_url>');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const sql = `INSERT OR REPLACE INTO discography_image_overrides (release_id, image_url, updated_at) VALUES (${releaseId}, ${esc(args.url)}, ${esc(now)});`;

  console.log(`Setting image override for release ${releaseId}...`);
  executeSQL(sql);
  console.log('Done.');

} else {
  // --- Sync mode ---
  const force = args.force ?? false;

  if (!force) {
    // Check most recent synced_at — skip if within 7 days
    try {
      const rows = queryD1('SELECT MAX(synced_at) AS last_sync FROM discography_releases') as { last_sync: string | null }[];
      const lastSync = rows[0]?.last_sync;
      if (lastSync) {
        const ageMs = Date.now() - new Date(lastSync).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays < 7) {
          console.log(`Discography synced ${ageDays.toFixed(1)} days ago — skipping. Use --force to override.`);
          process.exit(0);
        }
      }
    } catch {
      // Table may not exist yet — proceed with sync
    }
  }

  console.log('Fetching discography from Discogs...');
  const releases = await fetchAllReleases();
  console.log(`Fetched ${releases.length} releases.`);

  if (releases.length === 0) {
    console.error('No releases returned — aborting to avoid wiping D1 data.');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const rows = releases.map(release =>
    `(${release.id}, ${release.master_id != null ? release.master_id : 'NULL'}, ${esc(release.title)}, ${release.year}, ${esc(release.label)}, ${esc(release.thumb)}, ${esc(release.cover_image)}, ${esc(release.format)}, ${esc(release.release_type)}, ${esc(now)})`
  );

  // Wrangler has a batch limit — split into chunks of 100
  const CHUNK_SIZE = 100;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const sql = `INSERT OR REPLACE INTO discography_releases (id, master_id, title, year, label, thumb, cover_image, format, release_type, synced_at) VALUES\n${chunk.join(',\n')};`;
    executeSQL(sql);
    console.log(`Upserted ${Math.min(i + CHUNK_SIZE, rows.length)} / ${rows.length}`);
  }

  console.log('Sync complete.');

  if (args['fetch-covers']) {
    console.log('\nFetching hi-res cover images from Discogs detail API...');
    console.log('Rate limit: 1 request/sec. This will take several minutes.');

    // Re-read the rows we just stored so we have the current release list
    const storedRows = queryD1(
      'SELECT id, release_type, master_id FROM discography_releases'
    ) as { id: number; release_type: string; master_id: number | null }[];

    let updated = 0;
    let skipped = 0;

    for (const row of storedRows) {
      // 1 req/sec to stay well within Discogs rate limit (60/min authenticated)
      await new Promise(resolve => setTimeout(resolve, 1100));

      const endpoint = row.release_type === 'master'
        ? `https://api.discogs.com/masters/${row.id}`
        : `https://api.discogs.com/releases/${row.id}`;

      try {
        const response = await fetch(endpoint, { headers: DISCOGS_HEADERS });
        if (!response.ok) {
          console.warn(`  [${row.id}] HTTP ${response.status} — skipping`);
          skipped++;
          continue;
        }
        const data = await response.json() as { images?: { uri: string; type: string }[] };
        const primaryImage = data.images?.find(img => img.type === 'primary') ?? data.images?.[0];
        if (!primaryImage?.uri) {
          skipped++;
          continue;
        }
        const sql = `UPDATE discography_releases SET cover_image = ${esc(primaryImage.uri)} WHERE id = ${row.id};`;
        executeSQL(sql);
        updated++;
        process.stdout.write(`\r  ${updated} updated, ${skipped} skipped (${updated + skipped}/${storedRows.length})`);
      } catch (err) {
        console.warn(`  [${row.id}] Error: ${err}`);
        skipped++;
      }
    }

    console.log(`\nCover fetch complete. ${updated} updated, ${skipped} skipped.`);
  }
}
