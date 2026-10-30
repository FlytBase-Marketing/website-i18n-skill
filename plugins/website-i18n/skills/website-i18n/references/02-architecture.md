# 02: Architecture decisions

Make these decisions once, record them in `i18n.config.json` plus the
project's `docs/I18N.md`, and never re-decide them silently.

## URL strategy

| Option | Use when | Notes |
|---|---|---|
| **Subdirectory** `/fr/` | Default for marketing sites and SaaS | One host, one deploy, cheapest. Domain authority is shared |
| Subdomain `fr.site.com` | Separate teams or infra per market | More setup, and authority is partly split |
| ccTLD `site.fr` | Strong country targeting, legal entity per country | Most expensive. `.ai`, `.io`, `.tv` and `.me` count as generic, not country |
| `?lang=fr`, cookie, JS switch | **Never** | Google: parameters are "not recommended". Cookie and JS switching are one URL with many languages, so only one gets indexed |

Sources: developers.google.com/search/docs/specialty/international/managing-multi-regional-sites

### Default-locale prefix

- **as-needed** (`/pricing` = English, `/fr/pricing` = French). Cleaner URLs
  for the main market, and what Vercel, Linear and Notion do. You must 301/308
  `/en/*` to `/*`, for bots too, and never emit `/en/*` anywhere (canonical,
  hreflang, sitemap, OG, JSON-LD, breadcrumbs).
- **always** (`/en/pricing`). Symmetric and simpler to reason about. You must
  redirect `/pricing` to `/en/pricing`, or make `/` a selector page as
  `x-default`.
- **Changing the default locale later is a migration,** not a config flip.
  Every old URL needs a redirect. Write this down.

Canonicalization redirects (`/en/x` to `/x`, trailing slash) apply to
everyone, bots included. Locale negotiation (see below) never applies to bots.
Keep them as separate steps in middleware, with canonicalization first.

### Trailing slash

Pick one. Redirect the other form. Generate every URL through one function so
canonical, hreflang, sitemap, OG and JSON-LD agree byte for byte.

## Locale codes: three different systems

| System | Format | Example | Where |
|---|---|---|---|
| `lang` attribute, `Content-Language` header, JSON-LD `inLanguage` | BCP 47 | `en`, `zh-Hans`, `pt-BR`, `es-419` | `<html lang>` |
| hreflang | ISO 639-1, optionally plus ISO 3166-1 alpha-2 **or** a script subtag. No UN M.49 regions | `en`, `en-GB`, `zh-Hans`, `pt-BR` (**not** `es-419` or `en-UK`) | `<link rel=alternate>`, sitemap |
| Open Graph | `language_TERRITORY` with an underscore | `en_US`, `fr_FR`, `zh_CN` | `og:locale` |

**Your internal locale code** (the URL segment) can be the short form (`zh`).
Map it to the three systems in config. Translation APIs often want yet another
form (`zh` to `zh-CN`), so normalize inside the translator client, not
throughout the app.

**Language-only vs language-region.** Start language-only (`fr`, `es`, `pt`).
Add regions (`pt-BR` / `pt-PT`, `es-ES` / `es-MX`) only when the content
really differs. When you do, keep a generic catch-all (`es`) as well.

## Two content buckets

| Bucket | What | Owner | Storage | Translation trigger |
|---|---|---|---|---|
| 1. UI strings | Nav, buttons, labels, errors, aria, footer, static page copy, meta for code-driven pages | Developers | `messages/{locale}.json` (or `.po`, `.yaml`) | CI on change to the source file |
| 2. Content | Blog posts, case studies, landing pages built in the CMS, glossary, FAQ, authors, categories | Editors | CMS or Markdown | On publish (webhook) and a weekly drift repair |

Rule of thumb: **if a developer wrote it, it is Bucket 1. If an editor wrote
it, it is Bucket 2.** Never author the same string in both. A CTA label in the
CMS that duplicates a UI key drifts.

**Static pages built in code** (product, pricing, industry pages with prose
in TS registries) are Bucket 1. Move the prose into the message file under a
page namespace. Prose left in `.ts` data files silently ships English to
every locale. This was the reference project's most common leak.

## Fallback policy (missing translation)

| Policy | Behavior | When |
|---|---|---|
| **404 and omit (default)** | The localized URL 404s and is left out of hreflang, the sitemap and the switcher | Most sites. Honest and simplest for SEO |
| Redirect to source | `/fr/x` 302s to `/x` until translated | When inbound links to `/fr/x` already exist |
| Noindex fallback | Serve source content at `/fr/x` with `noindex`, canonical to `/x`, no hreflang entry | When UX needs localized chrome around untranslated content |
| ~~Index English at /fr~~ | Never | Duplicate content. Google calls boilerplate-only translation a poor experience |

**UI strings are different.** A missing key falls back to the source string
at render time. That is fine for a stray label, but the message check must
still fail CI so it gets fixed.

## Locale negotiation

| Policy | Behavior |
|---|---|
| **None (default)** | The URL decides. The switcher plus a remembered cookie handle the rest |
| Root only | `/` (`x-default`) may 302/307 humans to `/fr` from cookie or `Accept-Language`. Deep URLs never redirect. Bots are never negotiated. Send `Vary: Accept-Language, Cookie` |
| Suggestion banner | Every URL serves its own locale, and a dismissible banner offers the user's language. The best UX and SEO-safe |

Google: "Avoid automatically redirecting users from one language version of a
site to a different language version" and "Don't use IP analysis to adapt
your content." Googlebot crawls mostly from the US with no `Accept-Language`.

The reference project redirects humans on deep URLs by cookie, then
`Accept-Language`, then geo-IP, with a bot bypass. Bots are safe, but humans
who share a link get bounced to another URL, and CDN caching must vary. Do not
copy that part. Prefer the banner.

## Slugs

- **Mirrored (default):** `/fr/blog/drone-safety` uses the English slug.
  Cheap, and hreflang is trivial.
- **Localized:** `/fr/blog/securite-des-drones`. Better click-through, but
  you need:
  - a slug field per variant
  - a cross-locale link (translation metadata or `translationKey`)
  - a switcher that resolves the target slug
  - hreflang built from each variant's own slug
  - redirects when a slug changes
- **Either way:** **slug sync from source is opt-in,** and every rename emits
  a redirect in the same change. A silent rename strands every variant on the
  old slug, so hreflang points at a 404 while the real page is orphaned.
- **Keep URL paths ASCII** (percent-encoded if you must localize scripts), and
  make the router return a clean 404 for non-ASCII garbage paths. Some stacks
  500 on non-Latin-1 paths.

## Content model per CMS type (summary; full detail in 06)

```
Has its own URL?            -> document-level (one doc per locale, linked)
Referenced by other docs?   -> field-level (one doc, per-field locale values, coalesce fallback)
Catalog / global / external -> single-locale (record why in the schema)
```

## Scaling thresholds (revisit when crossed)

| Signal | Threshold | Action |
|---|---|---|
| Locales | 15+ | Consider a translation management system (Lokalise, Phrase, Crowdin) for review workflows |
| Source documents | 3,000+ | Batch review UI, market-tiered SLAs |
| Stale queue | 200+ | Tier the locales: not every market needs the same review speed |
| Sitemap URLs (all locales) | Approaching 50k per file | Split the sitemap index per content type or locale |
| Prerendered pages | Hosting output limits | Prebuild only the source locale plus top pages, and ISR the rest |
