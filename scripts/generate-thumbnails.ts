/**
 * Generates WebP thumbnails for all existing images in R2 that don't already have one.
 *
 * Requires env vars (or a .env file):
 *   R2_ACCOUNT_ID     - Cloudflare account ID
 *   R2_ACCESS_KEY_ID  - R2 API token access key
 *   R2_SECRET_KEY     - R2 API token secret key
 *
 * Create an R2 API token at:
 *   Cloudflare Dashboard → R2 → Manage R2 API tokens → Create API token (Object Read & Write)
 *
 * Usage:
 *   pnpm tsx scripts/generate-thumbnails.ts
 *   pnpm tsx scripts/generate-thumbnails.ts --dry-run
 */

import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env if present
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_KEY;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const D1_DATABASE_ID = 'b23d6493-bb87-4285-8a0f-35606e4fc635';
const BUCKET = 'twinkle-images';
const THUMB_WIDTH = 700;
const THUMB_QUALITY = 82;
const CONCURRENCY = 4;
const DRY_RUN = process.argv.includes('--dry-run');

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_KEY) {
  console.error('Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_KEY');
  process.exit(1);
}

if (!CF_API_TOKEN) {
  console.error('Missing CLOUDFLARE_API_TOKEN — create a custom token with D1 Edit permission at https://dash.cloudflare.com/profile/api-tokens');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_KEY },
});

function thumbKey(r2Key: string): string {
  const lastDot = r2Key.lastIndexOf('.');
  const base = lastDot !== -1 ? r2Key.slice(0, lastDot) : r2Key;
  return `${base}-thumb.webp`;
}

async function exists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function processImage(r2Key: string): Promise<'skipped' | 'created' | 'failed'> {
  const tKey = thumbKey(r2Key);

  if (await exists(tKey)) return 'skipped';

  if (DRY_RUN) {
    console.log(`  [dry-run] would create ${tKey}`);
    return 'created';
  }

  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: r2Key }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const originalBuffer = Buffer.concat(chunks);

    const thumbBuffer = await sharp(originalBuffer)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: tKey,
      Body: thumbBuffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    return 'created';
  } catch (error) {
    console.error(`  FAILED ${r2Key}: ${error instanceof Error ? error.message : error}`);
    return 'failed';
  }
}

async function runBatch<T>(items: T[], fn: (item: T) => Promise<void>, concurrency: number): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// Fetch all r2_keys from D1 via Cloudflare REST API
async function fetchAllR2Keys(): Promise<string[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql: 'SELECT r2_key FROM images ORDER BY created_at ASC' }),
  });
  const data = await response.json() as { success: boolean; result: { results: { r2_key: string }[] }[]; errors: { message: string }[] };
  if (!data.success) {
    throw new Error(`D1 query failed: ${data.errors.map(error => error.message).join(', ')}`);
  }
  return data.result[0].results.map(row => row.r2_key);
}

const r2Keys = await fetchAllR2Keys();
console.log(`Found ${r2Keys.length} images. Generating thumbnails (concurrency=${CONCURRENCY})...`);
if (DRY_RUN) console.log('DRY RUN - no files will be written\n');

let created = 0;
let skipped = 0;
let failed = 0;

await runBatch(r2Keys, async (r2Key) => {
  const result = await processImage(r2Key);
  if (result === 'created') { created++; process.stdout.write(`  + ${thumbKey(r2Key)}\n`); }
  else if (result === 'skipped') { skipped++; process.stdout.write(`.`); }
  else { failed++; }
}, CONCURRENCY);

console.log(`\n\nDone. created=${created} skipped=${skipped} failed=${failed}`);
