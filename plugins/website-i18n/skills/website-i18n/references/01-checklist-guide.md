# 01: Running the audit

The audit produces `I18N-CHECKLIST.md` (from `templates/I18N-CHECKLIST.md`).
The checklist is only as good as its evidence, so this file covers how to
gather that evidence quickly and honestly.

## Order of work

1. **Inventory routes.** Every route and its data source goes into a table:
   code, messages, CMS type, or Markdown. Next.js: `find src/app -name page.tsx`.
   Astro: `src/pages`. Nuxt: `pages/`. SvelteKit: `src/routes`. Hugo: `content/`.
2. **Read the i18n plumbing**: config, routing, middleware/proxy/hooks, root
   layout, metadata helper, sitemap, robots, switcher. Note `file:line` for
   every claim.
3. **Probe the running site** (production, preview, or a local
   `build && start`). Do not audit a dev server. Dev servers often render
   differently.
   ```bash
   node scripts/i18n-verify-site.mjs --sitemap https://site.com/sitemap.xml --limit 40 --report i18n-verify.md
   node scripts/i18n-verify-site.mjs --urls urls.txt --negotiation   # also probe forced redirects
   ```
4. **Run the curl matrix** from `04-rendering.md` on 3 representative pages:
   home, one static page, and one CMS detail page such as a blog post.
5. **Check message files** if they exist:
   ```bash
   node scripts/i18n-messages.mjs check --config i18n.config.json
   node scripts/i18n-messages.mjs stats --config i18n.config.json
   ```
   No config yet? The script accepts `--dir src/messages --source en`.
6. **Size the hardcoded strings:**
   `node scripts/i18n-scan-hardcoded.mjs src --top 30`.
7. **Fill in the checklist.** Then write the Summary, the top blockers, and
   the decisions needed.

## Evidence rules

- **Docs are claims, not evidence.** On the reference project, the docs said
  10 locales including Arabic RTL, while the code had 9 and no RTL. The docs
  also said missing CMS variants fall back to English, while the code
  returned 404, which was the better choice. Always verify in code or HTML.
- **A browser view is not evidence for rendering.** Hydration hides
  client-side translation. Use `curl`, or the verify script, which never runs
  JS.
- **Sample across page types,** not just the homepage. Static pages are often
  perfect while CMS detail pages leak English or advertise 404s.
- **Record the observed value** (`/fr/blog/x: hreflang de -> 404`), not only
  "fails".

## Severity

| Severity | Meaning | Examples |
|---|---|---|
| P0 | Launching a locale with this broken hurts indexing or shows the wrong language | Client-only translation, hreflang to 404s, cross-language canonical, forced redirects, English at /fr indexed, missing `lang` |
| P1 | Works today, but breaks at scale or drifts silently | No drift report, no staleness tracking, sitemap lastmod = build time, no lint gate |
| P2 | Polish and completeness | `og:locale` format, RSS per locale, suggestion banner |

## Auditor output contract

The auditor is read-only. It writes **only** `I18N-CHECKLIST.md` (plus an
optional `i18n/glossary.proposed.json`), then returns:

- the counts by severity and status
- the top blockers (ID plus one line each)
- the decisions needed, each with a recommended default
- the proposed translate / never-translate list, from `suggest-glossary`
  plus CMS names, with any native-script brand spellings that need a yes or
  no
- a **numbered action plan** for Phases 3 to 8: the files touched per step,
  packages to add, URL changes plus redirects, and the translation cost
  estimate
- anything it could not verify, and why (no URL, auth wall, build fails)

It changes no other file. The orchestrator then presents this to the user and
**waits for approval** before acting (see "Audit first, act only after
approval" in SKILL.md).
