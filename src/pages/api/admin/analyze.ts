import type { APIContext } from 'astro';
import { verifyAdminCookie } from '../../../lib/adminAuth';
import { detectImageFormat } from '../../../lib/imageFormat';

interface PosterAnalysis {
  event_date: string | null;
  location: string | null;
  caption: string | null;
  credit: string | null;
}

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

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const format = detectImageFormat(bytes);
  if (!format) {
    return new Response('Unsupported or invalid image file. Use JPEG, PNG, WebP, or GIF.', { status: 400 });
  }
  if (!format.supportedByClaude) {
    return new Response(`${format.label} images are not supported for AI analysis. Convert to JPEG, PNG, WebP, or GIF first.`, { status: 400 });
  }

  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  const base64 = btoa(binary);

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: format.mediaType, data: base64 },
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
    const errorText = await anthropicResponse.text();
    console.error('Anthropic API error:', anthropicResponse.status, errorText);
    return new Response(`Analysis failed: ${errorText || anthropicResponse.status}`, { status: 502 });
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
