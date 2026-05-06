# SEO Action Plan — twinklebrothersmusic.com
**Updated:** 2026-04-29
**Previous score:** 44/100 (Poor)
**Current score:** 59/100 (Needs Improvement)
**Target score:** 72/100 (Good) — achievable within 2-3 weeks

---

## Score Impact Map

| Fix | Category | Estimated points gained |
|-----|----------|------------------------|
| Fix character encoding (em dash mojibake) | On-Page SEO | +5 |
| Hero image alt text + fetchpriority | Image Optimization + CWV | +5 |
| Enrich MusicEvent schema (endDate, image, description, PostalAddress) | Schema | +8 |
| Add MusicGroup description/image/member | Schema | +4 |
| Write unique meta descriptions (4 pages) | Content Quality + On-Page | +3 |
| Add llms.txt | GEO | +2 |
| Add AI crawler directives to robots.txt | GEO + Technical | +1 |
| Add width/height to all images | Image Optimization (CLS) | +2 |
| Security headers | Technical SEO | +3 |
| Add WebSite schema | Schema | +2 |

**Projected total gain: ~+13 points -> ~72/100**

---

## Phase 1 — Immediate (this week, high impact, low effort)

### 1. Fix character encoding — em dash mojibake
**Priority:** Critical  
**Impact:** Fixes broken SERP title + all OG/Twitter share previews site-wide  
**Files:** `src/layouts/BaseLayout.astro` (or wherever title is rendered)  

The em dash `—` is being double-encoded. The raw bytes `\xc3\xa2\xc2\x80\xc2\x94` appear instead of the correct UTF-8 `\xe2\x80\x94`.

Check:
1. Confirm the source file uses a literal `—` character (U+2014), not `&mdash;` or a pasted Windows-1252 character
2. Confirm `<meta charset="UTF-8">` is in `<head>` and the template is saved as UTF-8
3. Confirm the build tool is not transcoding content (Astro/Vite should not)
4. After fixing, verify with: `curl -s https://twinklebrothersmusic.com | python3 -c "import sys; d=sys.stdin.buffer.read(); print(d[d.index(b'<title>')+7:d.index(b'</title>')])"` — should contain `\xe2\x80\x94`

Affected pages confirmed: homepage, tour page. Likely all pages using the same title template.

---

### 2. Hero image: alt text + LCP optimization
**Priority:** Critical  
**Impact:** Accessibility, image indexing, and LCP signal  
**File:** homepage Astro component or wherever `norman-ralston-2a91e2da.jpg` is rendered  

```html
<!-- Before -->
<img src="/cdn/norman-ralston-2a91e2da.jpg" />

<!-- After -->
<img
  src="/cdn/norman-ralston-2a91e2da.jpg"
  alt="Norman Grant and Ralston Grant of the Twinkle Brothers"
  fetchpriority="high"
  width="1920"
  height="1080"
/>
```

Do not add `loading="lazy"` to the hero/LCP image.

---

### 3. Add image width/height attributes to all gallery images
**Priority:** Warning  
**Impact:** Prevents CLS (Cumulative Layout Shift) — all 15 images currently missing dimensions  

Add `width` and `height` matching the rendered dimensions. For thumbnails rendered at a standard size, use the actual pixel dimensions from the source files.

---

### 4. AI crawler directives in robots.txt
**Priority:** Warning  
**Impact:** Explicit control over AI training crawlers; signals AI-search readiness  
**File:** `public/robots.txt`  

Add after the existing `*` block:

```
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Bytespider
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Allow: /
```

Adjust Allow/Disallow based on preference. Explicitly allowing reputable AI crawlers improves citation likelihood in AI-generated answers.

---

### 5. Create `/llms.txt`
**Priority:** Warning  
**Impact:** AI search discoverability — enables ChatGPT, Perplexity, Claude to identify and summarize the site  
**File:** `public/llms.txt`  

```
# Twinkle Brothers

> The definitive digital archive of Twinkle Brothers, reggae legends from Falmouth, Jamaica, active since 1962. Founded by Norman Grant, the band pioneered conscious reggae and dub music with releases on Virgin Records and Twinkle Records.

## Key Pages

- [History](https://twinklebrothersmusic.com/history): Full band history from 1962 to present
- [Discography](https://twinklebrothersmusic.com/discography): Complete discography
- [Tour](https://twinklebrothersmusic.com/tour): Upcoming live shows
- [Photos](https://twinklebrothersmusic.com/photos): Photographic archive
- [Timeline](https://twinklebrothersmusic.com/timeline): Chronological timeline of events
- [Listen](https://twinklebrothersmusic.com/listen): Streaming links and further listening
- [Videos](https://twinklebrothersmusic.com/videos): Live concerts and interviews
```

---

## Phase 2 — Schema Enrichment (this week, high impact)

### 6. Enrich MusicEvent schema — all 7 events
**Priority:** Warning  
**Impact:** Rich results eligibility for event carousels in Google Search  
**File:** `src/pages/tour.astro` (or wherever MusicEvent schema is generated)

Required additions per event:
- `endDate` — even if same as startDate for single-day events
- `image` — band photo or festival poster URL (absolute)
- `description` — short event description
- `location.address` — replace flat string with PostalAddress object
- `organizer` type — change from `MusicGroup` to `Organization`

Example corrected event:
```json
{
  "@context": "https://schema.org",
  "@type": "MusicEvent",
  "name": "Reggae Dub Nation",
  "startDate": "2026-06-19",
  "endDate": "2026-06-21",
  "description": "Twinkle Brothers performing at Reggae Dub Nation Festival, Limoges, France.",
  "image": "https://twinklebrothersmusic.com/og.png",
  "location": {
    "@type": "Place",
    "name": "Limoges, France",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Limoges",
      "addressCountry": "FR"
    }
  },
  "performer": {
    "@type": "MusicGroup",
    "name": "Twinkle Brothers",
    "url": "https://twinklebrothersmusic.com"
  },
  "organizer": {
    "@type": "Organization",
    "name": "Reggae Dub Nation"
  },
  "eventStatus": "https://schema.org/EventScheduled",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "offers": {
    "@type": "Offer",
    "url": "https://www.ticketmaster.fr/en/manifestation/...",
    "availability": "https://schema.org/InStock"
  }
}
```

---

### 7. Enrich MusicGroup schema
**Priority:** Warning  
**Impact:** Knowledge Panel completeness and entity disambiguation  
**File:** `src/layouts/BaseLayout.astro`

Add to existing MusicGroup block:
```json
{
  "description": "Twinkle Brothers are a reggae and dub group from Falmouth, Jamaica, founded in 1962 by Norman Grant. One of the longest-running acts in reggae, they have released over 30 albums and toured internationally for six decades.",
  "image": "https://twinklebrothersmusic.com/cdn/norman-ralston-2a91e2da.jpg",
  "member": [
    {
      "@type": "OrganizationRole",
      "member": {
        "@type": "Person",
        "name": "Norman Grant"
      },
      "roleName": "Vocalist, Founder"
    },
    {
      "@type": "OrganizationRole",
      "member": {
        "@type": "Person",
        "name": "Ralston Grant"
      },
      "roleName": "Vocalist"
    }
  ]
}
```

Also add MusicBrainz and Wikipedia to `sameAs` if entries exist.

---

### 8. Add WebSite schema with SearchAction
**Priority:** Warning  
**Impact:** Sitelinks searchbox eligibility  
**File:** `src/layouts/BaseLayout.astro`

Add alongside MusicGroup schema:
```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Twinkle Brothers",
  "url": "https://twinklebrothersmusic.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://twinklebrothersmusic.com/discography?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

---

## Phase 3 — Content (next 1-2 weeks)

### 9. Unique meta descriptions for all section pages
**Priority:** Warning  
**Impact:** CTR improvement from SERPs  

Pages needing unique descriptions:

| Page | Suggested description |
|------|-----------------------|
| /discography | Browse the complete Twinkle Brothers discography — over 30 albums of reggae and dub from Jamaica and the UK, from the 1970s to today. |
| /photos | Archival and live photography of the Twinkle Brothers spanning six decades of touring and recording. |
| /posters | Concert posters and promotional art from Twinkle Brothers tours and festivals worldwide. |
| /timeline | A chronological timeline of the Twinkle Brothers — from Falmouth, Jamaica in 1962 through six decades of reggae history. |

---

### 10. Expand homepage and thin page copy
**Priority:** Warning  
**Impact:** Content quality signals, entity extraction by AI crawlers  

- Homepage (247 words): add 150-200 words about Norman Grant, founding story, genre, key albums. Target 400+ words.
- Videos page (63 words): add intro paragraph, organize content by category (live concerts, interviews, documentaries)
- Listen page (60 words): add brief context about key albums, streaming platforms, recommended entry points

---

## Phase 4 — Infrastructure (ongoing)

### 11. Security headers
**Priority:** Warning  
**Impact:** Trust signals, browser security, Lighthouse security score  
**Where:** Cloudflare `_headers` file, Netlify `netlify.toml`, or Vercel `vercel.json`

Minimum headers:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

CSP requires careful testing — add in report-only mode first to avoid blocking resources.

---

### 12. Re-run PageSpeed for CWV baseline
**Priority:** Info  
**Action:** `python3 /Users/aronshamash/.claude/skills/seo/scripts/pagespeed.py https://twinklebrothersmusic.com --strategy mobile` — run when PSI API is not rate-limited to establish LCP, INP, CLS baseline.

---

## Maintenance Backlog

- Add `aria-label` to all image-only anchor links (31 identified)
- Investigate 208 orphan discography/image pages — add cross-links from discography hub
- Check MusicBrainz and Wikipedia for existing Twinkle Brothers entries; add to `sameAs`
- Verify BreadcrumbList schema on `/discography/[id]` pages
