import type { APIContext } from 'astro';

export async function POST(context: APIContext): Promise<Response> {
  const formData = await context.request.formData();

  const name = (formData.get('name') as string | null)?.trim() ?? '';
  const email = (formData.get('email') as string | null)?.trim() ?? '';
  const organisation = (formData.get('organisation') as string | null)?.trim() ?? '';
  const eventDate = (formData.get('event_date') as string | null)?.trim() ?? '';
  const venue = (formData.get('venue') as string | null)?.trim() ?? '';
  const message = (formData.get('message') as string | null)?.trim() ?? '';

  if (!name || !email || !message) {
    return Response.redirect(new URL('/contact?error=1', context.request.url), 303);
  }

  const lines: string[] = [
    `From: ${name} <${email}>`,
    organisation ? `Organisation: ${organisation}` : '',
    eventDate ? `Event date: ${eventDate}` : '',
    venue ? `Venue / Location: ${venue}` : '',
    '',
    message,
  ].filter(line => line !== undefined);

  const body = lines.join('\n');
  const subject = `Booking Enquiry${organisation ? ` — ${organisation}` : ''}: ${name}`;

  const mailtoUrl = `mailto:bookings@twinklebrothersmusic.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (context.locals as any).runtime?.env;

  // If a Resend API key is configured, send via API for a seamless experience.
  // Otherwise fall back to mailto redirect (opens visitor's email client).
  if (env?.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Twinkle Brothers Website <noreply@twinklebrothersmusic.com>',
          to: ['bookings@twinklebrothersmusic.com'],
          reply_to: email,
          subject,
          text: body,
        }),
      });

      if (!response.ok) throw new Error(`Resend error ${response.status}`);
      return Response.redirect(new URL('/contact?sent=1', context.request.url), 303);
    } catch {
      return Response.redirect(new URL('/contact?error=1', context.request.url), 303);
    }
  }

  // Mailto fallback — opens visitor's email client with fields pre-filled
  return Response.redirect(mailtoUrl, 303);
}
