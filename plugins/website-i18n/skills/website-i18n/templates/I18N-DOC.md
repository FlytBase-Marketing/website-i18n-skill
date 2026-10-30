# I18N.md: {{site name}} internationalization rules

> The i18n rulebook for humans and AI agents. Every translation decision is
> recorded here. Agents: read this before touching routing, metadata,
> message files or CMS translations.

## 1. Principles

- {{en}} is the single source of truth. Content is written in {{en}} first.
- Never hand-edit generated locale files or machine-translated CMS variants
  outside the review flow. Edit the source. Reviewers override through the
  lock list or the CMS review status.
- Every locale has its own URL. Localized text is in the server HTML.
- Untranslated content is not published under a localized URL. It {{404s /
  redirects to the source}}.
- Brand and product names are never translated (see `i18n/glossary.json`).
- Adding a locale is a config change plus a translation run, not a code
  change.

## 2. Decisions

| Decision | Choice | Date | Owner |
|---|---|---|---|
| Locales and tiers | {{en (source); fr, de, ja tier 1; ...}} | | |
| URL shape | Subdirectory, default locale {{unprefixed / prefixed}}, trailing slash {{never / always}} | | |
| Slugs | {{mirrored / localized}}. Sync opt-in, redirects on rename | | |
| Missing translation | {{404 and omit / redirect / noindex}} | | |
| Locale negotiation | {{none / root only / suggestion banner}} | | |
| Code mapping | `i18n.config.json` (lang, hreflang, og per locale) | | |
| Translation engine | Tiered LLM subagents, validated by `scripts/i18n/*` | | |
| Review | Tier 1: human review of titles, meta, CTAs, legal before indexing | | |

## 3. Two content buckets

| Bucket | What | Source | Translated by | Trigger |
|---|---|---|---|---|
| UI strings | Nav, buttons, labels, errors, static page copy, page meta | `{{src/messages/en.json}}` | `prep`, then translator agent, then `apply` | CI on change to the source file |
| Content | Blog, case studies, CMS pages, glossary, FAQ, authors | {{CMS / content dir}} | Fan-out on publish, plus weekly drift repair | Publish webhook |

If a developer wrote it, it's a UI string. If an editor wrote it, it's
content. Never both.

## 4. Where things live

| Concern | File |
|---|---|
| Locale list and codes | {{src/i18n/config.ts}} plus `i18n.config.json` |
| Routing and redirects | {{src/i18n/routing.ts, src/proxy.ts}} |
| Canonical and hreflang (single helper) | {{src/lib/seo/alternates.ts}} |
| Sitemap | {{src/app/sitemap...}} |
| Never-translate list and style | `i18n/glossary.json` |
| Translation state (hashes, locks, rejects) | `.i18n/` (commit `source-hashes.json` and `locked.json`, ignore jobs/out/archive) |
| Tooling | `scripts/i18n/` |

## 5. Workflows

**Add or change a UI string:** edit the source file only, using a namespaced
camelCase key. CI translates on merge. To protect a reviewed translation, add
its key to `.i18n/locked.json`.

**Publish content:** write and publish in {{en}}. Translations are created
automatically within minutes. Review tier-1 locales in the CMS (Language tab).

**Rename a slug:** dry-run the sync, add redirects for the old localized
URLs, then sync.

**Add a locale:**
1. Add it to the config files.
2. Add the glossary style.
3. Run `prep`, the translator, then `apply`.
4. Fan out the CMS content.
5. Run the verify script.
6. Run the QA pass.

**Add a brand or product name:** add it to `doNotTranslate` **before** the
copy lands. Run `check`. Re-run `prep` for any `invalid` items.

## 6. Checks (CI)

| Check | Command | When |
|---|---|---|
| Hardcoded strings | {{eslint rule / i18n-scan-hardcoded --fail-on-new}} | Every PR (changed files) |
| Message parity, placeholders, brands | `node scripts/i18n/i18n-messages.mjs check` | Every PR |
| Docs structure | `node scripts/i18n/i18n-docs.mjs check` | Every PR touching content |
| Live hreflang, canonical, rendering | `node scripts/i18n/i18n-verify-site.mjs --sitemap ...` | Weekly plus after deploys |
| CMS drift | {{drift script}} | Weekly |

## 7. Known exceptions

| What | Why | Until |
|---|---|---|
| {{legal pages English-only}} | {{legal review pending}} | {{date}} |
