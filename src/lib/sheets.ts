import { google } from 'googleapis';

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

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    for (const row of rows) {
      if (row.length < 2 || !row[0]) continue;

      const firstCol = String(row[0]).trim();

      if (firstCol === 'Date' || firstCol === '') continue;
      if (firstCol.toLowerCase().includes('band members')) continue;
      if (monthNames.includes(firstCol)) continue;
      if (!row[1] || String(row[1]).trim() === '') continue;
      if (firstCol.includes('#N/A') || firstCol === ')') continue;

      events.push({
        date: firstCol,
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
