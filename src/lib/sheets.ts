const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

function formatSheetDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return date.toLocaleDateString('en-GB', DATE_FORMAT);
  }
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const date = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return date.toLocaleDateString('en-GB', DATE_FORMAT);
  }
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString('en-GB', DATE_FORMAT);
}

export interface TourEvent {
  date: string;
  eventName: string;
  location: string;
  contact: string;
  confirmed: string;
}

let cachedEvents: TourEvent[] | null = null;
let cacheTime: number = 0;
const CACHE_DURATION = 60 * 60 * 1000;

function encodeBase64Url(input: string | Uint8Array): string {
  const str = typeof input === 'string' ? input : String.fromCharCode(...input);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = encodeBase64Url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  const signingInput = `${header}.${payload}`;
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );

  const signature = encodeBase64Url(new Uint8Array(signatureBuffer));
  const jwt = `${signingInput}.${signature}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json() as { access_token: string };
  return tokenData.access_token;
}

export async function fetchTourDates(skipCache = false): Promise<TourEvent[]> {
  const sheetId = import.meta.env.GOOGLE_SHEET_ID;
  const credentials = import.meta.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!sheetId || !credentials) {
    console.warn('Google Sheets credentials not set');
    return [];
  }

  if (!skipCache && cachedEvents && Date.now() - cacheTime < CACHE_DURATION) {
    return cachedEvents;
  }

  try {
    const serviceAccount = JSON.parse(credentials);
    const accessToken = await getGoogleAccessToken(serviceAccount.client_email, serviceAccount.private_key);

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:E`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error(`Sheets API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as { values?: string[][] };
    const rows = data.values ?? [];
    const events: TourEvent[] = [];

    for (const row of rows) {
      if (row.length < 2 || !row[0]) continue;

      const rawDate = String(row[0]).trim();
      if (rawDate === 'Date' || rawDate === '') continue;

      const displayDate = formatSheetDate(rawDate);
      if (!displayDate) continue;
      if (!row[1] || String(row[1]).trim() === '') continue;

      events.push({
        date: displayDate,
        eventName: String(row[1] || '').trim(),
        location: String(row[2] || '').trim(),
        contact: String(row[3] || '').trim(),
        confirmed: String(row[4] || '').trim(),
      });
    }

    cachedEvents = events;
    cacheTime = Date.now();

    return events;
  } catch (error) {
    console.error('Error fetching tour dates:', error);
    return [];
  }
}
