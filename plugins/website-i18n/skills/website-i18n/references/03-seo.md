# 03: International SEO

Primary sources:

- developers.google.com/search/docs/specialty/international/localized-versions
- developers.google.com/search/docs/specialty/international/managing-multi-regional-sites
- developers.google.com/search/docs/specialty/international/locale-adaptive-pages
- developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- w3.org/International/questions/qa-html-language-declarations
- ogp.me

## One URL builder, used everywhere

Create exactly one function, `urlFor(locale, path)`, that applies these:

- the site origin, from env (never hardcoded, so previews work)
- the default-locale prefix policy
- the trailing-slash policy
- the localized slug when it differs

Canonical, hreflang, the sitemap, `og:url`, JSON-LD `url`/`@id`, breadcrumbs
and the language switcher all call it.

**Asset URLs** (`/og/x.jpg`, `/logo.png`) go through a separate
`absoluteAssetUrl()` that **never** locale-prefixes. A locale-prefixed image
404s.

## hreflang

### Rules

- **One `<link>` per alternate:**
  `<link rel="alternate" hreflang="fr" href="https://site.com/fr/x">`.
- **Absolute URLs** with the scheme.
- **Self-reference:** each page lists itself.
- **Reciprocal:** if A lists B, B must list A, or Google ignores the pair.
- **The set is identical** on every member of the cluster.
- **`x-default`** goes to the source-locale page or a language selector.
- **Valid codes only:**
  - ISO 639-1 (`de`)
  - optionally `-` plus ISO 3166-1 alpha-2 (`de-AT`) or an ISO 15924 script
    (`zh-Hant`)
  - Not allowed: `en-UK` (use `en-GB`), `es-419`, or an underscore.
- **Targets must be live:** each target returns 200, is self-canonical, is
  not noindex, and **the translation actually exists.**
- **Google does not use hreflang or `lang` to detect a page's language.** It
  reads the visible content. hreflang only picks which sibling to show.

### Availability-aware alternates (the most common real bug)

Code-driven static pages exist in every locale by definition, so advertise
all of them. CMS pages exist in a locale only if a variant is published.

```ts
// Pseudocode: one helper for both cases
buildAlternates(path, currentLocale, available?: Partial<Record<Locale, string /* localized path */>>)
//  - available omitted  -> list every locale at the same path (static pages)
//  - available provided -> list only those locales, each at its OWN path (localized slug)
//  - always self-reference currentLocale
//  - x-default = source path if the source exists, else the current page
//  - canonical = urlFor(currentLocale, path)
```

The reference project advertised all 9 locales on CMS pages until a
case-study slug diverged in one locale. hreflang then pointed at 404s while the
real localized page sat orphaned (16 URLs). The fix was to project each
document's translation cluster (locale plus the variant's slug, excluding
draft-only variants) and pass it as `available`.

### One emission method

The HTML head, the HTTP `Link` header and the XML sitemap are equivalent to
Google. Using several gives no benefit and adds ways to disagree.

- **Preferred:** emit in the head through the framework's metadata API, from
  the single helper. Never also render `<link rel=alternate>` from a
  component. Duplicate tags make for contradictory clusters.
- **Optional:** also emit in the sitemap, but **only if both come from the
  same availability data**. The verify script compares them. If you cannot
  guarantee they match, drop the sitemap alternates.
- **Non-HTML files (PDF):** use the HTTP `Link` header.

## Canonical

- Self-referencing, absolute, in `<head>`, one per page.
- **Never cross-language.** `/fr/x` canonical to `/x` tells Google to drop
  `/fr/x`.
- For same-language regional duplicates (en-US vs en-GB with identical copy),
  choose one canonical and keep hreflang.
- `/en/x` (under as-needed) never renders a canonical. It redirects first.

## Untranslated and partial pages

- Prefer not having the URL at all: a 404, plus omission from hreflang,
  sitemap and switcher.
- If the URL must exist, redirect to the source, or serve with `noindex` plus
  a canonical to the source and no hreflang entry.
- `noindex` must be in the **server HTML**. If Googlebot sees noindex it may
  skip rendering, so a JS-removed noindex never un-noindexes.
- Translating only the nav and footer while the body stays English is called
  out by Google as a poor experience. Treat it as untranslated.

## XML sitemaps

- **Each entry:**
  - `<loc>` is the canonical locale URL.
  - `<xhtml:link rel="alternate" hreflang=".." href=".."/>` for every
    available variant **including itself** and `x-default`.
  - Declare `xmlns:xhtml="http://www.w3.org/1999/xhtml"`.
- **Only list URLs that are canonical, 200 and indexable.** No noindexed
  fallbacks, no redirects, no source-only pages under locale prefixes.
- **Limits:** 50,000 URLs or 50 MB uncompressed per file. Every locale URL
  counts. Split with a sitemap index by content type (pages, blog,
  case-studies, ...) or by locale.
- **`lastmod`:**
  - Use the last significant change **per URL per locale**. A German
    retranslation bumps only `/de/...`.
  - Never stamp build time on every row; Google ignores dishonest lastmod.
    That includes the sitemap index rows.
  - `priority` and `changefreq` are ignored by Google, so do not spend effort
    on them.
- **Use the localized slug** for each locale's `<loc>` and alternates. A
  sitemap that assumes the English slug everywhere advertises 404s.
- **Sitemap generation must not include draft content** (Sanity: no stega
  markers in URLs).

## robots.txt

- Reference the sitemap index. Do not block locale directories.
- Make the AI crawler policy explicit: GPTBot, ClaudeBot, PerplexityBot,
  Google-Extended, CCBot.
- Disallow admin and studio and the API, not content.

## HTML head per locale

| Element | Rule |
|---|---|
| `<html lang>` | BCP 47 for the locale. Required for accessibility (WCAG 3.1.1), screen readers, hyphenation and fonts |
| `dir` | `rtl` on `<html>` for ar, he, fa, ur. Never via CSS `direction` |
| `<title>` | Localized. Template suffix applied once (no "Blog - Brand \| Brand") |
| meta description | Localized. Google's AI-content guidance asks for review of titles, meta and alt too |
| canonical | Self, absolute |
| hreflang | From the helper |
| `og:locale` | `ll_CC` (`fr_FR`). Add `og:locale:alternate` for the others. Passing the bare `fr` is a common slip |
| `og:url` | The localized canonical |
| JSON-LD | `inLanguage` (BCP 47). Localized `name`, `headline` and `description`. Localized `url`/`@id` for the page node. Organization and WebSite `@id` stay global |
| Content-Language | If you want a Bing signal, use the HTTP header. Never the `http-equiv` meta (W3C says never use it) |
| `notranslate` | Optional. `<meta name="robots" content="notranslate">` stops Google offering machine translation of the page |

## Structured data per locale

- Builders take `locale` and return localized strings and URLs.
- Breadcrumb `item` URLs use `urlFor(locale, ...)`.
- `Article` gets `inLanguage`, a localized `headline`, and the variant's
  `datePublished`/`dateModified`. The author points to the localized author
  URL.
- FAQPage questions and answers come from the localized document.
- `VideoObject` and others: keep `contentUrl` global, and localize the text.
- Fetch CMS data for JSON-LD **without** visual-editing or stega markers.

## Google's stance on machine-translated content (2025-2026)

- Translation is not spam in itself. **Scaled content abuse** covers
  low-value content "no matter how it's created", including automated
  translation, published at scale without adding value.
- In June 2025 Google removed its old advice to robots-block auto-translated
  pages.
- The AI-content guidance asks for human fact-check and review. Map that to
  review tiers. Do not publish thin auto-translated pages in tier-3 locales at
  scale.

## Search Console

- The International Targeting report was removed in September 2022. There is
  no hreflang error report in Search Console, so CI must validate hreflang.
- Use **URL Inspection** on one URL per locale after launch. The
  Google-selected canonical must equal the user-declared canonical.
- Submit only the sitemap index.
