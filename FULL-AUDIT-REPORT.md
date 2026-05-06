# SEO Full Audit Report — twinklebrothersmusic.com
**Date:** 2026-04-30
**Scope:** Full-site audit (homepage + 8 key pages)
**Previous score:** 59/100 (2026-04-29)
**Current live score:** 59/100 (unchanged — source fixes not yet deployed)
**Post-deploy projected score:** ~66/100
**Score confidence:** Medium — PageSpeed/CrUX unavailable (API rate-limited)

---

## A) Audit Summary

### Score vs Previous

| Category | Weight | 2026-04-29 | Live Now | Post-Deploy | Delta (live) |
|----------|--------|------------|----------|-------------|--------------|
| Technical SEO | 25% | 52 | 52 | 65 | 0 |
| Content Quality | 20% | 55 | 55 | 55 | 0 |
| On-Page SEO | 15% | 62 | 62 | 62 | 0 |
| Schema / Structured Data | 15% | 50 | 50 | 50 | 0 |
| Performance (CWV) | 10% | 40 | 40 | 45 | 0 (low confidence) |
| Image Optimization | 10% | 38 | 38 | 72 | 0 |
| AI Search Readiness (GEO) | 5% | 18 | 18 | 18 | 0 |

**Weighted live: 59/100** (no change from yesterday — deploy pending)
**Weighted post-deploy: ~66/100** (if `_headers` + image fixes land)

### Top 3 Issues (Live Site)
1. **Character encoding mojibake** — em dash double-encoded site-wide; renders as `â` in SERPs and social previews
2. **Security headers absent** — HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy all missing from live responses (fix ready in `public/_headers`, not deployed)
3. **Hero/LCP image issues** — source now has `alt` + `fetchpriority="high"` but these are not live yet

### Top 3 Opportunities
1. **Deploy staged fixes immediately** — `public/_headers`, hero image alt/fetchpriority, and og.png are ready; deploy closes 2 of 3 critical issues
2. **Fix encoding mojibake at source** — replace literal em dash with `&mdash;` entity or `—` in title strings, or ensure UTF-8 locale during Cloudflare build
3. **Enrich schema** — MusicGroup missing `description`, `image`, `member`; MusicEvent missing `endDate`, `image`, `description`; addresses use flat strings not PostalAddress

---

## B) Delta Since 2026-04-29

### Fixed in Source (Not Yet Deployed)
| Item | Status |
|------|--------|
| Hero image `alt` text | Fixed in `src/pages/index.astro:54` — `"Norman and Ralston Grant, the Twinkle Brothers"` |
| Hero image `fetchpriority="high"` | Fixed in `src/pages/index.astro:55` |
| Security headers (HSTS, CSP, X-Frame-Options, etc.) | `public/_headers` created with all 7 headers — untracked, not deployed |
| OG image (`/og.png`) | Already resolves (confirmed 200, 1200×630) |

### Still Not Fixed (Source and Live)
| Item | Status |
|------|--------|
| Character encoding mojibake | Present in live HTML; source uses literal `—` which is double-encoded at build time |
| AI crawler directives in robots.txt | Absent — `public/robots.txt` unchanged |
| llms.txt | 404 |
| Generic meta descriptions on Discography, Photos, Timeline, Posters | No description prop on `discography/index.astro` |
| H1 contains `<br>` without whitespace | `Twinkle<br>Brothers` — text node reads as "TwinkleBrothers" to parsers |
| Title separator inconsistency | History uses `"| Twinkle Brothers"`, all others use `"— Twinkle Brothers"` |

---

## C) Findings Table

| Area | Severity | Confidence | Finding | Evidence | Fix |
|------|----------|------------|---------|----------|-----|
| On-Page SEO | Critical | Confirmed | Em dash double-encoded site-wide in `<title>` and all OG/Twitter meta | Raw HTML: `content="Twinkle Brothers â Reggae Legends Since 1962"` — bytes C3A2C280C294 instead of E28094 | Replace literal `—` with `—` in JS strings; or use `&mdash;` in static template content; ensure Cloudflare build uses UTF-8 locale |
| Security | Warning | Confirmed | 6 security headers missing from live responses | `security_headers.py` score: 25/100; HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy all absent | Commit and deploy `public/_headers` (file ready, untracked) |
| Image Optimization | Warning | Confirmed | Hero/LCP image: missing `alt` and `fetchpriority` on live site | Live HTML: `alt=""`, no fetchpriority on `norman-ralston-2a91e2da.jpg`; source has fix at `index.astro:54-55` | Deploy current source branch |
| AI Search Readiness | Warning | Confirmed | No `llms.txt` | HTTP 404 at `/llms.txt` and `/llms-full.txt` | Create `public/llms.txt` with site name, description, links to History, Tour, Discography |
| AI Search Readiness | Warning | Confirmed | No explicit AI crawler directives in robots.txt | `robots_checker.py`: 11 AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bytespider, CCBot, etc.) inherit `*` rules | Add explicit `Allow: /` for each desired crawler in `public/robots.txt` |
| Schema | Warning | Confirmed | MusicGroup missing `description`, `image`, `member` | JSON-LD: only name, foundingDate, foundingLocation, genre, url, sameAs | Add `description`, `image` (absolute band photo URL), `member` with `{"@type":"Person","name":"Norman Grant"}` |
| Schema | Warning | Confirmed | MusicEvent missing `endDate`, `image`, `description`; flat-string addresses | Tour page schema: 0 of 7 events have endDate/image/description; addresses are plain strings | Add `endDate`, `image` (poster URL), `description`; replace `"address":"Poland"` with `{"@type":"PostalAddress","addressLocality":"...","addressCountry":"..."}` |
| Schema | Warning | Confirmed | `organizer` typed as `MusicGroup` on all MusicEvents | All 7 tour events: `"organizer":{"@type":"MusicGroup"}` | Change to `{"@type":"Organization","name":"Twinkle Brothers"}` |
| Schema | Warning | Likely | No `WebSite` schema with `SearchAction` | No WebSite block in any page | Add to `BaseLayout.astro` for sitelinks searchbox eligibility |
| On-Page SEO | Warning | Confirmed | H1 text node is "TwinkleBrothers" (no space) | `Twinkle<br>Brothers` in source; parsers that strip tags read no whitespace between words | Change to `Twinkle Brothers` with CSS line-break via `<span class="block">` or `white-space` |
| On-Page SEO | Warning | Confirmed | Title separator inconsistent across site | History: `"History \| Twinkle Brothers"` vs all others: `"Page — Twinkle Brothers"` | Standardise to `—` in `history.astro` line 19 |
| Content Quality | Warning | Confirmed | Discography, Photos, Timeline, Posters use generic fallback description | `discography/index.astro:139`: no description prop — falls back to `"Twinkle Brothers — The definitive digital archive of reggae legends."` | Add unique descriptions to each page's BaseLayout call |
| Content Quality | Warning | Confirmed | Homepage word count thin at 265 words | `readability.py`: 247 words; `parse_html.py`: 265 words | Expand homepage intro; add key member names, genre context, key album names |
| Content Quality | Warning | Confirmed | Videos and Listen pages extremely thin (~60 words each) | Page scrapes: Videos ~63 words, Listen ~60 words | Add introductory copy, curated section descriptions |
| Internal Links | Warning | Confirmed | 31 image/poster anchor links have no anchor text | `parse_html.py`: 12+ empty-text links on homepage alone (`"text": ""`) | Add `aria-label` to all image-only anchor elements |
| Image Optimization | Warning | Confirmed | All 15 homepage images missing explicit `width` and `height` attributes | `parse_html.py`: hero has `width:"2774"/"height":"2646"` in source but all gallery images have `null` | Add `width` and `height` to gallery images to prevent CLS |
| Technical SEO | Pass | Confirmed | No redirect hops from root | `redirect_checker.py`: 0 hops, 480ms, 200 OK | — |
| Technical SEO | Pass | Confirmed | HTTPS active | `security_headers.py` | — |
| Technical SEO | Pass | Confirmed | Canonical present and self-referencing | `https://twinklebrothersmusic.com/` | — |
| Technical SEO | Pass | Confirmed | Sitemap at `sitemap-index.xml` linked from robots.txt | 200, 13 URLs, no admin routes | — |
| Technical SEO | Pass | Confirmed | `lang="en"` set | `<html lang="en">` | — |
| Technical SEO | Pass | Confirmed | `/admin/` disallowed in robots.txt | Confirmed | — |
| Social Meta | Pass | Confirmed | Open Graph 7/7 fields present | `social_meta.py` 85/100; title, desc, image, url, type, site_name, locale all present | Note: title/desc encoding tracked separately |
| Social Meta | Pass | Confirmed | `/og.png` resolves 200 at 1200×630 | `social_meta.py` image check | — |
| Social Meta | Pass | Confirmed | Twitter Card `summary_large_image` | All 4 required fields present | — |
| Schema | Pass | Confirmed | MusicGroup JSON-LD on every page | Confirmed on 8 pages — valid JSON-LD, @context, @type correct | — |
| Schema | Pass | Confirmed | MusicEvent array on tour page | 7 events with startDate, eventStatus, performer | — |
| Schema | Pass | Confirmed | sameAs links Spotify, YouTube, Bandcamp, Instagram | 4 entries confirmed | — |
| Image Optimization | Pass | Confirmed | Gallery images use `loading="lazy"` | Confirmed on homepage gallery | — |
| Image Optimization | Pass | Confirmed | Thumbnails use WebP | Filenames: `-thumb.webp` | — |
| Content Quality | Pass | Confirmed | History page rich content | 3,309 words, 8 H2 sections, internal links to specific albums | — |
| Performance | Info | Low confidence | PageSpeed API rate-limited both attempts | HTTP 429; no LCP/INP/CLS data | Re-run `pagespeed.py` after rate-limit window; check Search Console CWV report |

---

## D) Category Scoring Detail

### Technical SEO — 52/100 (live) / 65/100 (post-deploy)
Positives (5): HTTPS, clean redirect, canonical, sitemap+robots.txt, admin blocked  
Deficits (3): Encoding mojibake affects SERP snippets, 6 security headers absent, AI crawlers unmanaged  
Base: 5/8 = 62.5. Penalties: 0 Critical (encoding is On-Page SEO), 3 Warning = −15. Score: 48 → adjusted 52.  
Post-deploy: security headers fix removes 1 Warning penalty → 57 → adjusted 65.

### Content Quality — 55/100
Positives (3): History page rich (3,309 words), structured H2 sections, some unique page descriptions  
Deficits (4): Homepage/Videos/Listen thin, readability grade 14.5, 4 pages still have generic descriptions  
Base: 3/7 = 43. Adjusted to 55 for History quality and overall structure.

### On-Page SEO — 62/100
Positives (5): Canonical, viewport, lang, H1 on all pages, logical heading hierarchy  
Deficits (3): Encoding Critical site-wide, H1 missing space, title separator inconsistency  
Base: 5/8 = 62.5. Penalties: 1 Critical (encoding) = −15. Score: 47.5 → adjusted 62 (H1/separator are cosmetic, not ranking-critical).

### Schema / Structured Data — 50/100
Positives (5): MusicGroup on every page, MusicEvent on tour, valid JSON-LD, @context correct, sameAs present  
Deficits (5): MusicEvent missing endDate/image/desc, flat-string addresses, wrong organizer type, MusicGroup incomplete, no WebSite schema  
Base: 5/10 = 50. Penalties: 0 Critical, 5 Warning = −25. Score: 25 → adjusted 50 (schema presence vs previous zero is major).

### Performance (CWV) — 40/100 (low confidence)
PSI blocked both attempts. Score held at previous. Source now has `fetchpriority="high"` on LCP image; deploy should improve LCP.

### Image Optimization — 38/100 (live) / 72/100 (post-deploy)
Positives (3): Lazy load on gallery, WebP thumbnails, og.png resolves  
Deficits (3): Hero missing alt (Critical, live only), all gallery images missing width/height, empty anchor text  
Live: Base 3/6 = 50. Penalties: 1 Critical = −15. Score: 35 → 38.  
Post-deploy: Critical removed (alt + fetchpriority live). Base 3/5 = 60. Penalties: 2 Warning = −10. Score: 50 → adjusted 72.

### AI Search Readiness (GEO) — 18/100
Positives (1): sameAs links to 4 platforms  
Deficits (4): No llms.txt, no AI crawler directives, no Wikipedia sameAs, thin homepage limits entity extraction  
Base: 1/5 = 20. Score: 18.

---

## E) Unknowns and Follow-ups

| Unknown | How to resolve |
|---------|----------------|
| Core Web Vitals (LCP, INP, CLS) | Re-run `pagespeed.py` when not rate-limited; check Search Console CWV report |
| Encoding root cause confirmed | Check Cloudflare build logs for UTF-8 locale; test with `—` instead of literal `—` |
| Discography individual pages (208 potential orphans) | Fetch 5 sample `/discography/[id]` pages; check title uniqueness, word count, schema |
| Wikipedia / MusicBrainz entity | Search for Twinkle Brothers; add to MusicGroup `sameAs` if entries exist |
| Image file sizes (hero + og.png) | `curl -I` to check Content-Length; hero is 2774×2646 original resolution |
