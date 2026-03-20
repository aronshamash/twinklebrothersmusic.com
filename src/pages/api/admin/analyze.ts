import type { APIContext } from 'astro';
import { verifyAdminCookie } from '../../../lib/adminAuth';

interface PosterAnalysis {
  event_date: string | null;
  location: string | null;
  caption: string | null;
  credit: string | null;
}

const MEDIA_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export async function POST(context: APIContext): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (context.locals as any).runtime?.env;

  if (!env) return new Response('Server error', { status: 500 });
  if (!await verifyAdminCookie(context.request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const apiKey = env.ANTHROPIC_API_KEY as string | undefined;
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 503 });
  }

  const formData = await context.request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return new Response('Missing file', { status: 400 });

  const extMatch = file.name.match(/\.[^.]+$/);
  const ext = (extMatch ? extMatch[0] : '.jpg').toLowerCase();
  const mediaType = MEDIA_TYPES[ext] ?? 'image/jpeg';

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
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
    }),
  });

  if (!anthropicResponse.ok) {
    console.error('Anthropic API error:', anthropicResponse.status);
    return new Response('Analysis failed', { status: 502 });
  }

  const data = await anthropicResponse.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content[0]?.type === 'text' ? data.content[0].text.trim() : '';
  const jsonText = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');

  try {
    const analysis = JSON.parse(jsonText) as PosterAnalysis;
    return Response.json(analysis);
  } catch {
    return new Response('Failed to parse analysis', { status: 502 });
  }
}
