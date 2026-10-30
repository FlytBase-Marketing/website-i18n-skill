# I18N Checklist: {{site name}}

- **Site:** {{production URL}} | **Preview:** {{preview URL or n/a}}
- **Stack:** {{framework + version}}, rendering {{SSG / ISR / SSR / SPA}}, CMS {{none / Sanity / ...}}
- **Source locale:** {{en}} | **Target locales:** {{fr, de, ja, ...}}
- **Audited:** {{YYYY-MM-DD}} by {{agent/model}} | **Last updated:** {{YYYY-MM-DD}}

## In plain words (for the site owner)

{{3-6 sentences, no jargon. What works, what is broken, what it means for visitors and Google, what happens next. Use the analogies from references/10-working-with-operators.md.}}

## Summary

| Severity | PASS | FAIL | WARN | N/A |
|---|---|---|---|---|
| P0 (blocks launch) | | | | |
| P1 (fix before scale) | | | | |
| P2 (polish) | | | | |

**Top blockers:** {{3-5 one-line items with IDs}}

**Decisions needed from the owner:** {{list with recommended default}}

**Proposed plan (awaiting approval):** {{numbered steps: files touched, packages, URL changes and redirects, cost estimate}}

**Approval:** {{not yet approved / approved by <name> on <date>: steps 1-n}}. No changes are made before this line says approved.

## How to fill this in

- **Status** is one of `PASS`, `FAIL`, `WARN` or `N/A`.
- **Evidence is mandatory.** Use one of:
  - `path/file.ts:42`
  - a URL and the observed value (e.g. `/fr/pricing -> <html lang="en">`)
  - a command and its output line
- **Fix** is one line naming the file or system to change.
- Never mark `PASS` from reading docs alone. Docs drift from code, so verify in
  code or against the live HTML.

---

## A. Decisions and inventory

| ID | Sev | Check | How to verify | Status | Evidence | Fix |
|---|---|---|---|---|---|---|
| A1 | P0 | Locale list, source locale and per-locale review tier are written down in one config | `i18n.config.json` or the framework i18n config exists and matches the docs | | | |
| A2 | P0 | URL strategy chosen: subdirectory, subdomain or ccTLD. No `?lang=`, cookie-only or JS-only switching | Visit a page, switch language, and check that the URL changed | | | |
| A3 | P0 | Default-locale prefix policy is set, and the duplicate form redirects (as-needed: `/en/x` 301/308 to `/x`; always: `/x` to `/en/x`) | `curl -sI <base>/en/<path>` | | | |
| A4 | P1 | Trailing-slash policy is set. The other form redirects, and canonical, hreflang and sitemap all use the chosen form | `curl -sI <url>/` | | | |
| A5 | P1 | Slug policy is set (mirrored or localized). Renames ship with redirects | Docs and the redirect map | | | |
| A6 | P0 | Fallback policy for missing translations: 404 and omit, redirect to source, or noindex. Never English indexed at a localized URL | Request a page known to be untranslated | | | |
| A7 | P0 | Code mapping is defined: `lang` (BCP 47), `hreflang` (ISO 639-1[-ISO 3166-1 or script]) and `og:locale` (`ll_CC`) per locale | Config | | | |
| A9 | P0 | Translate / never-translate list is approved by the owner: brands, products, models, programs, partners, people, standards; forced terms per locale; approved native-script brand spellings (if any) | `glossary.json` plus the approval note in the change log | | | |
| A8 | P1 | Content inventory: every page type is classified as code-driven static, message-driven, CMS document-level, CMS field-level, or single-locale (not translated, with the reason written down) | Route list against the inventory | | | |

## B. Routing and rendering

| ID | Sev | Check | How to verify | Status | Evidence | Fix |
|---|---|---|---|---|---|---|
| B1 | P0 | Every localized page's translated main content is in the server HTML (SSG, ISR or SSR) | `curl -s <base>/fr/<path> \| grep '<expected French phrase>'` | | | |
| B2 | P0 | No forced redirect on localized or deep URLs from IP or `Accept-Language` | `curl -sI -H 'Accept-Language: de' <base>/fr/<path>` returns 200 | | | |
| B3 | P0 | Crawlers are never locale-negotiated | `curl -sI -A Googlebot <base>/<path>` returns 200 with the source content | | | |
| B4 | P1 | Any negotiated response (usually only `/`) sends `Vary: Accept-Language` (and/or Cookie), or is uncacheable | `curl -sI <base>/` | | | |
| B5 | P0 | An unknown locale segment returns 404, not 500 and not the source content | `curl -sI <base>/xx/<path>` | | | |
| B6 | P1 | The 404 page returns status 404 in every locale, with localized chrome | `curl -sI <base>/fr/does-not-exist` | | | |
| B7 | P1 | A non-ASCII or malformed path returns 404, not 500 | `curl -sI '<base>/ko/%EC%82%AC%EB%A1%80'` | | | |
| B8 | P1 | The build does not cross-join every locale with every slug when variants do not exist (page-count or deploy-size blowups) | Static params per detail route include an explicit locale and come from real variants | | | |
| B9 | P1 | On-demand revalidation covers every locale variant of a changed page (ISR or CDN) | Webhook handler code | | | |
| B10 | P2 | Locale-specific pages that are deliberately source-only (campaign pages) render only in the source locale and 404 elsewhere, with no hreflang | Route code | | | |

## C. HTML head (per locale)

| ID | Sev | Check | How to verify | Status | Evidence | Fix |
|---|---|---|---|---|---|---|
| C1 | P0 | `<html lang>` matches the locale (BCP 47) | verify script | | | |
| C2 | P1 | `dir="rtl"` on `<html>` for RTL locales (an attribute, not CSS) | verify script | | | |
| C3 | P0 | `<title>` is localized and unique per locale. Template suffix applied once | verify script (duplicate-title warnings) | | | |
| C4 | P0 | Meta description is localized | verify script | | | |
| C5 | P0 | Canonical is absolute and self-referencing in the same locale. Never cross-language | verify script | | | |
| C6 | P0 | hreflang codes are valid (no `en-UK`, `es-419` or `en_US`, no country-only codes) | verify script | | | |
| C7 | P0 | The hreflang set is self-referencing, reciprocal and identical on every member | verify script (reciprocity) | | | |
| C8 | P0 | hreflang targets return 200, are self-canonical, not noindex, and the translation really exists | verify script (targets) | | | |
| C9 | P1 | `x-default` is present and points to the source or selector page | verify script | | | |
| C10 | P1 | hreflang comes from one emission path and one helper (no duplicate tags from a component plus the metadata API) | grep for `rel="alternate"` / `hreflang` | | | |
| C11 | P2 | `og:locale` in `ll_CC` form plus `og:locale:alternate` | verify script | | | |
| C12 | P1 | JSON-LD `inLanguage` is set, and `url`, `name` and `description` are localized. Asset URLs are never locale-prefixed | View source | | | |
| C13 | P1 | No accidental `noindex` on localized pages. Intentional noindex is in the server HTML, not added by JS | verify script | | | |
| C14 | P2 | No `<meta http-equiv="Content-Language">`. If Bing needs a signal, use the HTTP header | grep | | | |

## D. Sitemaps and robots

| ID | Sev | Check | How to verify | Status | Evidence | Fix |
|---|---|---|---|---|---|---|
| D1 | P0 | The sitemap lists every indexable locale URL, and only canonical, 200, indexable ones | verify script (sitemap mode) | | | |
| D2 | P0 | Sitemap `xhtml:link` alternates equal the head hreflang for the same URL (or only one method is used) | verify script (sitemap vs head) | | | |
| D3 | P0 | CMS entries list only locales whose translation is published (availability-aware, using the localized slug) | Sitemap builder code | | | |
| D4 | P1 | `lastmod` is real per URL and per locale, not build time on every row | Sitemap output | | | |
| D5 | P1 | The sitemap index is split before 50k URLs or 50 MB (every locale URL counts) | Count | | | |
| D6 | P1 | robots.txt references the sitemap index and blocks no locale paths | `curl <base>/robots.txt` | | | |
| D7 | P2 | AI crawler policy is explicit (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) | robots.txt | | | |
| D8 | P2 | `llms.txt` (if used) lists localized sections or states the source-language scope | File | | | |

## E. UI strings (Bucket 1)

| ID | Sev | Check | How to verify | Status | Evidence | Fix |
|---|---|---|---|---|---|---|
| E1 | P0 | An i18n library with server-side message loading (next-intl, `@nuxtjs/i18n`, Paraglide, `astro:i18n` plus messages, Hugo i18n, ...) | Code | | | |
| E2 | P0 | No hardcoded user-facing strings in templates | `i18n-scan-hardcoded.mjs` count; lint rule on | | | |
| E3 | P0 | Strings in data files and registries (`src/content/*.ts`, constants) are moved to messages or the CMS | grep registries for prose | | | |
| E4 | P1 | Alt text, aria labels, `<title>`, meta, JSON-LD strings, form errors, toasts and emails are all localized | Spot-check views and the email templates | | | |
| E5 | P1 | ICU plurals and select. No string concatenation or sentence assembly | grep for `+ t(` and template literals around `t()` | | | |
| E6 | P1 | Dates, numbers, currency and lists use `Intl` with an explicit locale (and timezone on the server) | grep for `toLocaleDateString()` without a locale | | | |
| E7 | P1 | Keys are namespaced camelCase. The source file is the only file edited by hand | Key sample, git log of locale files | | | |
| E8 | P0 | Locale files have parity with the source: no missing, empty or raw-key renders, and placeholder parity holds | `i18n-messages.mjs check` | | | |
| E9 | P1 | Brand and product names are protected (do-not-translate glossary, `translate="no"`) and never duplicated ("Brand Brand") | `check` (glossary, repeat rules) | | | |
| E10 | P2 | Images with baked-in text have per-locale variants or no text | Visual pass | | | |
| E11 | P1 | Forms store the submitter's locale. Autoresponders are sent in that locale | Form handler | | | |

## F. CMS and blog content (Bucket 2)

| ID | Sev | Check | How to verify | Status | Evidence | Fix |
|---|---|---|---|---|---|---|
| F1 | P0 | Each content type has a chosen model: document-level (own URL) or field-level (referenced entity), or single-locale with the reason recorded | Schema against the decision tree | | | |
| F2 | P0 | Source-first: variants are created from the source and linked (translation metadata or a `translationKey`) | Schema and fan-out code | | | |
| F3 | P1 | Fan-out on publish (webhook or CI), fill-only so reviewer edits survive | Handler code | | | |
| F4 | P1 | Drift report: missing, unpublished or stale-slug variants found weekly, failing loudly, with accepted exceptions listed | Scheduled job | | | |
| F5 | P1 | Slug sync is opt-in and emits redirects for renamed variants | Fan-out code | | | |
| F6 | P1 | Non-translatable fields (images, refs, dates) are inherited onto variants | Variant document sample | | | |
| F7 | P1 | Field-level reads fall back to the source locale (`coalesce`). The array item's locale is read from the right property | Query code | | | |
| F8 | P0 | Detail pages build hreflang from the document's real translations, using each variant's own slug | Page metadata code | | | |
| F9 | P1 | Blog index, category, tag, author and related-post lists only show posts available in that locale | Listing queries | | | |
| F10 | P2 | RSS and Atom feeds per locale, with `<language>` set | Feed route | | | |
| F11 | P2 | Site search indexes per locale and searches the active locale | Search config | | | |
| F12 | P1 | Staleness is tracked: a variant records its source revision or hash, and reviewers see a stale queue | Schema field and query | | | |
| F13 | P2 | Per-locale publish and updated dates and reading time (CJK counted by characters) | Template | | | |
| F14 | P1 | Rich text is translated node by node (Portable Text, MDX or HTML): marks, links, embeds and code survive | Sample variant, diff of the structure | | | |

## G. Translation pipeline

| ID | Sev | Check | How to verify | Status | Evidence | Fix |
|---|---|---|---|---|---|---|
| G1 | P0 | A glossary exists: do-not-translate terms plus per-locale forced terms | `glossary.json` | | | |
| G2 | P1 | Model tiers are configured: cheap for UI strings, balanced for long-form, retry tier for rejects | `i18n.config.json` | | | |
| G3 | P0 | Every machine output is validated (placeholders, tags, glossary, non-empty, length ratio) before merge | `apply` log | | | |
| G4 | P1 | Staleness: changed source strings are re-translated (source hash or prev-commit diff), unchanged ones are not | `.i18n/source-hashes.json` | | | |
| G5 | P1 | Reviewer overrides are protected (lock list or `reviewed` status) from the auto-refresh | `.i18n/locked.json` or the CMS status | | | |
| G6 | P1 | Review tiers per locale are documented. Tier 1 locales get human review of titles, meta, CTAs and legal | docs/I18N.md | | | |
| G7 | P2 | Cost estimate and budget alert | `i18n-messages.mjs stats` | | | |
| G8 | P1 | CI translates on source change, with a bot identity accepted by the deploy pipeline and no self-trigger loop | Workflow file | | | |

## H. UX, layout and accessibility

| ID | Sev | Check | How to verify | Status | Evidence | Fix |
|---|---|---|---|---|---|---|
| H1 | P0 | The language switcher links to the equivalent page as a crawlable `<a href>`, with native language names, `lang`/`hreflang` on each link, and no flags | View source of the switcher | | | |
| H2 | P1 | A locale the page does not exist in is hidden or links to the nearest localized parent, never to a 404 | Switcher on a CMS page with partial translations | | | |
| H3 | P1 | The user's choice persists (cookie) and overrides detection | Manual test | | | |
| H4 | P1 | Text expansion holds: no clipped buttons or nav, and stats or tickers handle long values | Pseudo-locale or the longest locale (de, fr, ru) at mobile width | | | |
| H5 | P1 | CJK: fonts subset or loaded per locale, with `word-break: keep-all` (ko) and `line-break: strict` (ja) where relevant | CSS | | | |
| H6 | P1 | RTL (if any): logical CSS properties, mirrored directional icons, and tested end to end | Visual pass at /ar | | | |
| H7 | P2 | Optional "view in your language" suggestion banner instead of a redirect | Component | | | |

## I. Verification and CI

| ID | Sev | Check | How to verify | Status | Evidence | Fix |
|---|---|---|---|---|---|---|
| I1 | P0 | `i18n-verify-site.mjs` passes on preview and production with 0 errors | Report | | | |
| I2 | P0 | `i18n-messages.mjs check` passes with 0 errors | Output | | | |
| I3 | P1 | The lint gate for hardcoded strings runs on changed files in CI | Workflow | | | |
| I4 | P1 | The weekly drift and verify job runs and has an owner | Workflow | | | |
| I5 | P2 | Google Search Console URL Inspection run on 1 URL per locale: Google-selected canonical equals the user canonical | GSC | | | |
| I6 | P2 | The project i18n doc exists and agents are pointed to it from AGENTS.md or CLAUDE.md | Files | | | |

---

## Change log

| Date | Phase | What changed | By |
|---|---|---|---|
