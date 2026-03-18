/**
 * Ingest a photo or poster into R2 + D1.
 *
 * Usage:
 *   pnpm ingest --file ./photo.jpg --type photo --taken_at 1978-06-01 --caption "Band in Jamaica"
 *   pnpm ingest --file ./poster.jpg --type poster  # auto-extracts metadata via Claude vision
 *   pnpm ingest:local --file ./poster.jpg --type poster  # uses local Wrangler D1+R2, no CF creds needed
 *
 * Required env vars (.env) for remote mode:
 *   CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   ANTHROPIC_API_KEY  (for --type poster AI analysis; skipped if absent)
 *
 * Local mode (--local): uses wrangler's local D1 SQLite + local R2.
 *   Run `pnpm db:migrate` first to seed the local DB.
 *
 * For photos: EXIF DateTimeOriginal → taken_at, GPS → location (auto-filled).
 * For posters: Claude vision reads the image and extracts event_date, location, caption.
 * CLI flags always override auto-extracted values.
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, basename, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import Anthropic from '@anthropic-ai/sdk';
import exifr from 'exifr';

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
    file:       { type: 'string' },
    type:       { type: 'string', default: 'photo' },
    taken_at:   { type: 'string' },
    event_date: { type: 'string' },
    caption:    { type: 'string' },
    credit:     { type: 'string' },
    location:   { type: 'string' },
    'no-analyze': { type: 'boolean', default: false },
    'local':      { type: 'boolean', default: false },
  },
});

const isLocal = args.local ?? false;

if (!args.file) {
  console.error('Error: --file is required');
  process.exit(1);
}

const filePath = args.file;
if (!existsSync(filePath)) {
  console.error(`Error: file not found: ${filePath}`);
  process.exit(1);
}

const type = args.type ?? 'photo';
if (!['photo', 'poster'].includes(type)) {
  console.error('Error: --type must be "photo" or "poster"');
  process.exit(1);
}

// --- EXIF (photos) ---
let exifTakenAt: string | null = null;
let exifLocation: string | null = null;

try {
  const exif = await exifr.parse(filePath, { gps: true, pick: ['DateTimeOriginal', 'GPSLatitude', 'GPSLongitude'] });
  if (exif?.DateTimeOriginal) {
    const d = new Date(exif.DateTimeOriginal);
    if (!isNaN(d.getTime())) {
      exifTakenAt = d.toISOString().split('T')[0];
      console.log(`EXIF date: ${exifTakenAt}`);
    }
  }
  if (exif?.latitude != null && exif?.longitude != null && !args.location) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${exif.latitude}&lon=${exif.longitude}&format=json`,
        { headers: { 'User-Agent': 'twinklebrothersmusic.com/ingest' } }
      );
      const geo = await res.json() as { display_name?: string };
      exifLocation = geo.display_name ?? null;
      if (exifLocation) console.log(`EXIF location: ${exifLocation}`);
    } catch {
      // best-effort
    }
  }
} catch {
  // no EXIF — expected for scanned prints and poster JPGs
}

// --- Claude vision analysis (posters) ---
interface PosterAnalysis {
  event_date: string | null;   // ISO YYYY-MM-DD
  location: string | null;     // "Venue, City, Country"
  caption: string | null;      // short event title
  credit: string | null;       // promoter / designer credit
}

let aiAnalysis: PosterAnalysis | null = null;

if (type === 'poster' && !args['no-analyze'] && process.env.ANTHROPIC_API_KEY) {
  console.log('Analyzing poster with Claude vision...');
  try {
    const imageBytes = readFileSync(filePath);
    const base64 = imageBytes.toString('base64');
    const ext = extname(filePath).toLowerCase();
    const mediaTypeMap: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
    };
    const mediaType = mediaTypeMap[ext] ?? 'image/jpeg';

    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: base64 },
          },
          {
            type: 'text',
            text: `This is a concert poster for the Twinkle Brothers reggae band. Extract the following and return ONLY valid JSON, no other text:
{
  "event_date": "YYYY-MM-DD or null if not clear",
  "location": "Venue name, City, Country or null",
  "caption": "Short event title (e.g. 'Dub Shack Presents — Twinkle Brothers Live')",
  "credit": "Promoter or production company name, or null"
}
If a year is not visible but a day+month is, use the most plausible year based on context.`,
          },
        ],
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    // Strip any markdown fences
    const jsonText = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
    aiAnalysis = JSON.parse(jsonText) as PosterAnalysis;
    console.log('Claude analysis:', aiAnalysis);
  } catch (error) {
    console.warn('Claude analysis failed, continuing without it:', error);
  }
} else if (type === 'poster' && !args['no-analyze'] && !process.env.ANTHROPIC_API_KEY) {
  console.log('ANTHROPIC_API_KEY not set — skipping AI analysis. Add it to .env to enable.');
}

// Parse partial dates: "1978" → {iso: "1978-01-01", precision: "year"}
function parsePartialDate(raw: string): { iso: string; precision: 'year' | 'month' | 'day' } {
  if (/^\d{4}$/.test(raw))       return { iso: `${raw}-01-01`, precision: 'year' };
  if (/^\d{4}-\d{2}$/.test(raw)) return { iso: `${raw}-01`,   precision: 'month' };
  return                                 { iso: raw,           precision: 'day' };
}

// --- Merge values (CLI > AI > EXIF) ---
const rawTakenAt = args.taken_at ?? exifTakenAt;
const parsedDate = rawTakenAt ? parsePartialDate(rawTakenAt) : null;
const takenAt    = parsedDate?.iso ?? null;
const precision  = parsedDate?.precision ?? 'day';

const eventDate = args.event_date ?? aiAnalysis?.event_date ?? null;
const location  = args.location   ?? aiAnalysis?.location  ?? exifLocation;
const caption   = args.caption    ?? aiAnalysis?.caption   ?? null;
const credit    = args.credit     ?? aiAnalysis?.credit    ?? null;

if (takenAt) console.log(`Date: ${takenAt} (precision: ${precision})`);
if (!takenAt && type === 'photo') {
  console.warn('Warning: no --taken_at and no EXIF date. Image will have null taken_at.');
}

// --- Upload to R2 ---
const id = randomUUID();
const fileExt = extname(basename(filePath)).toLowerCase() || '.jpg';
const safeBasename = basename(filePath, extname(filePath))
  .toLowerCase()
  .replace(/[^a-z0-9-_]/g, '-')
  .slice(0, 60);
const r2Key = `${safeBasename}-${id.slice(0, 8)}${fileExt}`;

const contentTypeMap: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.tiff': 'image/tiff', '.tif': 'image/tiff',
};
const contentType = contentTypeMap[fileExt] ?? 'image/jpeg';

console.log(`Uploading → R2: ${r2Key} (${isLocal ? 'local' : 'remote'})`);

if (isLocal) {
  // Wrangler local R2 — no credentials needed
  execSync(
    `pnpm wrangler r2 object put twinkle-images/${r2Key} --file "${filePath}" --content-type "${contentType}" --local`,
    { stdio: 'inherit' }
  );
} else {
  const cfAccountId       = process.env.CF_ACCOUNT_ID;
  const r2AccessKeyId     = process.env.R2_ACCESS_KEY_ID;
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!cfAccountId || !r2AccessKeyId || !r2SecretAccessKey) {
    console.error('Error: CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY must be set in .env');
    console.error('Tip: use --local for development without Cloudflare credentials.');
    process.exit(1);
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${cfAccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
  });

  await s3.send(new PutObjectCommand({
    Bucket: 'twinkle-images',
    Key: r2Key,
    Body: readFileSync(filePath),
    ContentType: contentType,
  }));
}

console.log('R2 upload complete.');

// --- Insert into D1 ---
function sqlStr(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

const sql = [
  'INSERT INTO images (id, r2_key, type, taken_at, event_date, date_precision, caption, credit, location)',
  `VALUES (${sqlStr(id)}, ${sqlStr(r2Key)}, ${sqlStr(type)}, ${sqlStr(takenAt)}, ${sqlStr(eventDate)}, ${sqlStr(precision)}, ${sqlStr(caption)}, ${sqlStr(credit)}, ${sqlStr(location)});`,
].join(' ');

const sqlFile = join(tmpdir(), `ingest-${id}.sql`);
writeFileSync(sqlFile, sql, 'utf-8');

try {
  console.log('Inserting into D1...');
  const localFlag = isLocal ? ' --local' : '';
  execSync(`pnpm wrangler d1 execute DB --file "${sqlFile}"${localFlag}`, { stdio: 'inherit' });
  console.log(`\nDone.`);
  console.log(`  ID:         ${id}`);
  console.log(`  R2 key:     ${r2Key}`);
  console.log(`  type:       ${type}`);
  console.log(`  event_date: ${eventDate}`);
  console.log(`  location:   ${location}`);
  console.log(`  caption:    ${caption}`);
} finally {
  unlinkSync(sqlFile);
}
