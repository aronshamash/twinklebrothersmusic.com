import { google } from 'googleapis';

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

function formatSheetDate(raw: string): string | null {
  // ISO: 2026-04-07
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return date.toLocaleDateString('en-GB', DATE_FORMAT);
  }
  // DD/MM/YYYY
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const date = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return date.toLocaleDateString('en-GB', DATE_FORMAT);
  }
  // Fallback: let JS try
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

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A:E',
    });

    const rows = response.data.values || [];
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
