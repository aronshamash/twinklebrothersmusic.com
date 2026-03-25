/**
 * Populate Spotify and YouTube Music URLs for discography releases.
 *
 * Usage:
 *   pnpm populate-streaming                              # populate missing entries
 *   pnpm populate-streaming --force                      # re-populate all (overwrite)
 *   pnpm populate-streaming:local                        # against local D1
 *   pnpm populate-streaming --id 123                     # single release
 *   pnpm populate-streaming --dry-run                    # print matches, no writes
 *   pnpm populate-streaming --set --id 123 \
 *     --spotify https://... --youtube-music https://...  # manual override
 *
 * Required env vars (.env):
 *   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
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
    force:            { type: 'boolean', default: false },
    'dry-run':        { type: 'boolean', default: false },
    set:              { type: 'boolean', default: false },
    local:            { type: 'boolean', default: false },
    id:               { type: 'string' },
    spotify:          { type: 'string' },
    'youtube-music':  { type: 'string' },
  },
});

const isLocal = args.local ?? false;
const localFlag = isLocal ? ' --local' : ' --remote';
const isDryRun = args['dry-run'] ?? false;

// --- D1 helpers (same pattern as sync-discography.ts) ---
function executeSQL(sql: string): void {
  if (isDryRun) {
    console.log('[dry-run] SQL:', sql.slice(0, 120) + (sql.length > 120 ? '...' : ''));
    return;
  }
  const tmpFile = join(tmpdir(), `streaming-${randomUUID()}.sql`);
  writeFileSync(tmpFile, sql, 'utf-8');
  try {
    execSync(`pnpm wrangler d1 execute DB --file "${tmpFile}"${localFlag}`, { stdio: 'inherit' });
  } finally {
    unlinkSync(tmpFile);
  }
}

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

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

// --- Spotify API ---
async function getSpotifyToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('Error: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in .env');
    process.exit(1);
  }
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) {
    console.error(`Spotify auth failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  const data = await response.json() as { access_token: string };
  return data.access_token;
}

interface SpotifyAlbum {
  id: string;
  name: string;
  external_urls: { spotify: string };
  release_date: string;
  artists: { name: string }[];
}

async function searchSpotify(
  token: string,
  title: string,
  year: number
): Promise<{ url: string; score: number; matched: string } | null> {
  const normalise = (str: string) => str.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const normTitle = normalise(title);

  // Try two queries: with artist qualifier first, then without
  const queries = [
    `artist:"twinkle brothers" album:${title}`,
    `twinkle brothers ${title}`,
    title,
  ];

  let bestScore = 0;
  let bestMatch: SpotifyAlbum | null = null;

  for (const query of queries) {
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album&limit=5`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) continue;

    const data = await response.json() as { albums: { items: SpotifyAlbum[] } };
    const candidates = data.albums?.items ?? [];

    for (const candidate of candidates) {
      const candTitle = normalise(candidate.name);
      const candYear = parseInt(candidate.release_date?.slice(0, 4) ?? '0', 10);
      const artistNames = candidate.artists.map(artist => normalise(artist.name)).join(' ');
      const hasTwinkle = artistNames.includes('twinkle');

      let score = 0;
      if (candTitle === normTitle) score += 3;
      else if (candTitle.includes(normTitle) || normTitle.includes(candTitle)) score += 2;
      if (year > 0 && Math.abs(candYear - year) <= 1) score += 2;
      if (hasTwinkle) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    // Stop trying further queries if we already have a strong match
    if (bestScore >= 5) break;
    await sleep(200);
  }

  // If artist is confirmed Twinkle Brothers, title match alone is enough (score ≥ 2)
  // Otherwise require title + year match to avoid false positives on common/short titles (score ≥ 4)
  const artistConfirmed = bestMatch?.artists.some(artist =>
    normalise(artist.name).includes('twinkle')
  ) ?? false;
  const threshold = artistConfirmed ? 2 : 4;
  if (!bestMatch || bestScore < threshold) return null;

  return {
    url: bestMatch.external_urls.spotify,
    score: bestScore,
    matched: `${bestMatch.name} (${bestMatch.release_date?.slice(0, 4)}) by ${bestMatch.artists.map(a => a.name).join(', ')}`,
  };
}

// --- Odesli API ---
async function getYouTubeMusicUrl(spotifyUrl: string): Promise<string | null> {
  const url = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json() as {
      linksByPlatform?: { youtubeMusic?: { url: string } };
    };
    return data.linksByPlatform?.youtubeMusic?.url ?? null;
  } catch {
    return null;
  }
}

// --- Sleep helper ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================
// Main
// ============================================================

if (args.set) {
  // Manual override mode
  const releaseId = args.id ? parseInt(args.id, 10) : NaN;
  if (isNaN(releaseId)) {
    console.error('Usage: --set --id <release_id> [--spotify <url>] [--youtube-music <url>]');
    process.exit(1);
  }
  const spotifyUrl = args.spotify ?? null;
  const ytUrl = args['youtube-music'] ?? null;
  const now = new Date().toISOString();
  const sql = `INSERT OR REPLACE INTO discography_streaming_links (release_id, spotify_url, youtube_music_url, updated_at)
VALUES (${releaseId}, ${esc(spotifyUrl)}, ${esc(ytUrl)}, ${esc(now)});`;
  console.log(`Setting streaming links for release ${releaseId}...`);
  executeSQL(sql);
  console.log('Done.');
  process.exit(0);
}

// Populate mode
const force = args.force ?? false;
const singleId = args.id ? parseInt(args.id, 10) : null;

console.log(`Mode: ${isDryRun ? 'dry-run' : 'write'} | Target: ${isLocal ? 'local' : 'remote'} D1`);

type D1Release = { id: number; title: string; year: number };
type D1StreamingRow = { release_id: number };

let releases = queryD1('SELECT id, title, year FROM discography_releases ORDER BY year ASC') as D1Release[];

if (singleId) {
  releases = releases.filter(release => release.id === singleId);
  if (releases.length === 0) {
    console.error(`No release found with id ${singleId}`);
    process.exit(1);
  }
}

if (!force) {
  const existing = queryD1('SELECT release_id FROM discography_streaming_links') as D1StreamingRow[];
  const existingIds = new Set(existing.map(existingRow => existingRow.release_id));
  const before = releases.length;
  releases = releases.filter(release => !existingIds.has(release.id));
  if (before !== releases.length) {
    console.log(`Skipping ${before - releases.length} already-populated releases (use --force to overwrite).`);
  }
}

if (releases.length === 0) {
  console.log('Nothing to populate.');
  process.exit(0);
}

console.log(`Processing ${releases.length} releases...\n`);

const token = await getSpotifyToken();

let matched = 0;
let skipped = 0;

for (const release of releases) {
  // Spotify search
  const spotify = await searchSpotify(token, release.title, release.year);

  if (!spotify) {
    console.log(`[skip] ${release.title} (${release.year || '?'}) — no Spotify match`);
    skipped++;
    await sleep(300);
    continue;
  }

  // Odesli for YouTube Music — throttle to ~1 req/sec
  await sleep(1100);
  const ytUrl = await getYouTubeMusicUrl(spotify.url);

  console.log(`[✓] ${release.title} (${release.year || '?'})`);
  console.log(`    Spotify: ${spotify.matched} (score ${spotify.score}) → ${spotify.url}`);
  console.log(`    YouTube Music: ${ytUrl ?? 'not found'}`);

  const now = new Date().toISOString();
  const sql = `INSERT OR REPLACE INTO discography_streaming_links (release_id, spotify_url, youtube_music_url, updated_at)
VALUES (${release.id}, ${esc(spotify.url)}, ${esc(ytUrl)}, ${esc(now)});`;
  executeSQL(sql);

  matched++;
  await sleep(300);
}

console.log(`\nDone. ${matched} matched, ${skipped} skipped.`);
if (skipped > 0) {
  console.log(`Use --set --id <id> --spotify <url> --youtube-music <url> to manually fill skipped entries.`);
}
