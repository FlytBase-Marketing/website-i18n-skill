# 08: Lessons learned (real incidents)

Source: a production Next.js 16 + Sanity marketing site with 9 locales
(FlytBase), from git history and docs, 2026. Each lesson gives the symptom,
the root cause, the rule, and the automated check that catches it.

| # | Symptom | Root cause | Rule | Check |
|---|---|---|---|---|
| 1 | hreflang on CMS pages pointed at 404s; real localized pages orphaned (16 URLs) | Alternates listed every locale at the English path. One case study's localized slug differed | hreflang from the document's **published** translation cluster with each variant's own slug | verify script: hreflang targets return 200 and are self-canonical |
| 2 | 3 case studies and 3 posts each advertised 8 localized URLs that 404'd | Translation ran only by hand. New content published since the last run had no variants | Fan-out on publish via webhook, plus a weekly read-only drift report that fails loudly | Drift report in CI |
| 3 | An English slug rename stranded 8 variants on the old slug | The slug was set at variant creation and never synced | Slug sync opt-in, dry run lists renames, redirects ship with the rename | Drift report: slug mismatch |
| 4 | Localized pages lost cover images, authors and categories | Variants were created with only the translated fields | Inherit non-translatable fields fill-only | Variant shape audit |
| 5 | Raw keys (`reasons.drone.bullets`) rendered on every non-English page | The translation tree walker skipped string arrays | Tooling must treat array elements as leaves | `i18n-messages.mjs check` (parity includes array indices) |
| 6 | `/fr/industries` showed English H1 and description | Locale file held the English value, so the tool considered it "filled" | Detect identical-to-source values. Clear them and re-translate | `check`: identical-to-source rule |
| 7 | "FlytBase FlytBase..." in 46 ja/zh strings | Machine translation duplicated a brand term at sentence start | Do-not-translate terms are protected and checked for unexpected repeats | `check`/`apply`: repeated-term rule |
| 8 | "10x Partner Academy" translated in some keys, literal in others, same locale | The program name was not in the glossary | Every proper noun in `doNotTranslate` | `apply`: glossary rule |
| 9 | Industry pages, catalog and detail prose showed English everywhere | Prose lived in `.ts` content registries outside the message files | Move registry prose into messages (Bucket 1) or the CMS | `i18n-scan-hardcoded.mjs` plus a grep of registries |
| 10 | Hardcoded JSX strings kept appearing despite docs saying "always use t()" | Documentation alone does not stop humans or agents | `react/jsx-no-literals` warn locally, fail CI on changed files | Lint gate workflow |
| 11 | Deploy failed at 7,627 prerendered pages | Child `[slug]` static params without a locale cross-joined the parent layout's locales | Explicit `{ locale, slug }` pairs from real variants, or source-only prebuild plus ISR | `audit:static-params` script in CI |
| 12 | 500 instead of 404 on `/ko/industries/사례 연구` (crawler-invented URL) | Next.js wrote the decoded path into a cache-tag header. Non-Latin-1 throws | Reject non-Latin-1 or malformed paths with a 404 at the top of middleware | curl matrix row 4 |
| 13 | Unknown slug rendered on demand returned 500 instead of 404 | `not-found` called request-dependent i18n APIs, flipping static to dynamic at runtime | Keep 404 pages free of header- or cookie-reading calls (framework-specific) | curl `/fr/does-not-exist` returns 404 |
| 14 | French hero stats wrapped to 3 lines and showed "0Plus de 1,1 million" | Translators turned "1.1M+" into prose. The count-up animation assumed digits | Prefer `Intl` compact notation. Scale type by the longest value. Skip animation for non-numeric values | Pseudo-locale and longest-locale visual pass |
| 15 | A field-level card fell back to English after a Studio re-save | Code read the locale from `_key`. The new plugin version stores it in `language` with a random `_key` | Read by `language`, then fall back to `_key`. Audit and backfill old items | `audit:i18n-array-keys` |
| 16 | Manual tone fixes in a locale file were overwritten | Source-diff refresh cleared every changed key in every locale | Lock list or review status protects overrides | `.i18n/locked.json` honored by `prep` |
| 17 | Translate CI silently became fill-only | Shallow checkout, so `HEAD~1` was missing and the staleness diff became a no-op | `fetch-depth: 2`, or use source hashes instead of git diff | Hash-based staleness |
| 18 | Translate bot commits merged but never deployed | The deploy platform's author verification rejected the bot identity | The bot commits as a verified identity. Document it | Workflow review |
| 19 | Weekly check permanently red over videos with no localized URL | The check counted types that can never be "fixed" | An accepted-untranslated list: reported, not counted | Drift report design |
| 20 | Docs said 10 locales with Arabic RTL and English fallback for missing CMS variants; code had 9 locales, no RTL, and 404s | Docs drifted from code | Audit from code and HTML, never docs. Update docs in the same PR as config | Auditor evidence rules |

## Gaps the reference project still had at the time of writing

These are worth checking on any site:

- **A second hreflang emission path.** next-intl middleware adds an HTTP
  `Link` header with alternates for every locale (`alternateLinks` defaults
  to true), on top of the head tags from `generateMetadata`. The header is
  not availability-aware, so on a partially translated CMS page it
  contradicts the head. It is also only sent on requests that pass through
  `intlMiddleware`; bots on unprefixed paths are rewritten past it. Fix: set
  `alternateLinks: false` in `defineRouting`.

- **Forced locale redirects for humans on deep URLs.** The order was cookie,
  then `Accept-Language`, then geo-IP, with only a bot bypass. Google advises
  against automatic redirects. Prefer root-only negotiation or a banner, and
  send `Vary`.
- **The sitemap advertised every locale for CMS detail pages using the
  English slug,** while page hreflang was availability-aware. The two
  disagree whenever a variant is missing or has a localized slug.
- **Sitemap index `lastmod` was set to the request time** on every child.
- **`og:locale` emitted bare codes** (`fr`) instead of `fr_FR`, with no
  `og:locale:alternate`.
- **Locale labels were ASCII-flattened** ("Espanol", "Francais") and some
  were English names ("Japanese"). Use native names.
