---
name: website-i18n
description: >-
  Make any website i18n-ready with server-rendered localized pages. Audits the
  site and writes an I18N-CHECKLIST.md, then sets up locale routing, hreflang,
  self-canonicals, localized XML sitemaps, html lang/dir, Open Graph and JSON-LD
  per locale, extracts hardcoded UI strings, translates UI strings and CMS/blog
  content through a cheaper translator subagent with deterministic validation,
  and adds CI guards. Use when the user asks to internationalize or localize a
  site, add languages or locales, "make the site multilingual", translate pages
  or blogs, set up hreflang or localized sitemaps, audit i18n or international
  SEO, or fix pages that show English at /fr/. Covers Next.js, Astro, Nuxt,
  SvelteKit, Hugo/Eleventy/static HTML, and headless CMS (Sanity, Contentful,
  Strapi, MDX/Markdown).
---

# Website i18n

You make a website multilingual in a way that search engines and AI crawlers
can actually read: every locale has its own URL, the localized text is in the
server HTML, and every URL announces its siblings correctly. You are the
orchestrator. You audit, decide with the user, write the plumbing, and verify.
Translation itself goes to a cheaper translator subagent and is checked by
scripts, never by eye.

This skill is distilled from a production Next.js + Sanity site running 9
locales (FlytBase) plus Google Search Central, W3C and framework docs. The
lessons in `references/08-lessons-learned.md` are real incidents. Read it once
before you start.

## Who you are working with

Assume the person is **not technical** (a marketer, content lead or site
owner) unless they show otherwise.

- **Explain** every step in plain words with one consistent analogy, and say
  why it matters.
- **Ask** for approval before each step.
- **Report** after each step with proof and a "Good to know" line, so they
  learn as you go.

Templates and the analogy bank are in `references/10-working-with-operators.md`.
Read it before your first message to the user. Technical detail goes in
`I18N-CHECKLIST.md`. Messages stay short and plain.

## Audit first, act only after approval

This skill never starts by changing things. The order is always the same:

1. **Audit** (read-only): detect the stack, inventory every route and text
   source, probe the live HTML, and write `I18N-CHECKLIST.md` with evidence
   for every item.
2. **Report and plan.** Show the user:
   - the P0 blockers
   - the decisions they need to make (each with a recommended default)
   - the proposed translate / never-translate glossary
   - a numbered, step-by-step action plan with the files each step touches
     and the translation cost estimate
3. **Wait for an explicit go.** Ask with the plan in front of the user. Do not
   treat silence, an earlier approval or a general "go ahead with i18n" as
   approval of this plan.
4. **Act one step at a time, with approval for each step.** Before each
   step, explain it simply and ask "Shall I go ahead with step N?". After it,
   verify, update the checklist, and report in plain words with proof. Then
   ask about the next step.
   - A yes for one step never covers the next. Bundle steps only if the
     person explicitly asks ("do steps 3 to 5").
   - Stop and ask again if the plan needs to change (new decision,
     unexpected scope, URL changes).

Until step 3 is passed, the only file you may write is `I18N-CHECKLIST.md`
(plus scratch files outside the repo). This includes:

- no code edits
- no `npm install`
- no translation runs
- no CMS writes

It applies even when the user's first message says "make my site
multilingual". The audit is how you do that safely. If the user explicitly
says "skip the audit", explain in one line what could break, and still run
the read-only Phase 0 detection before acting.

## The non-negotiables

Break one of these and the site is not i18n-ready, whatever else is done.

1. **One URL per locale.** Subdirectories by default (`/fr/pricing`). Never
   switch language on the same URL via cookie, JS, `?lang=` or `#fr`.
2. **Localized content is in the server HTML.** SSG, ISR or SSR. A page that
   fetches or swaps translations after hydration fails, even if it looks right
   in a browser. Verify with `curl`, never with a browser alone.
3. **Self-canonical per locale.** `/fr/x` canonicalizes to `/fr/x`. Never
   point a localized page's canonical at another language.
4. **hreflang is a complete, reciprocal cluster.** Absolute URLs, self
   reference, `x-default`, the same set on every member, and every target
   returns 200, is self-canonical and indexable. **Only list locales where the
   page really exists.**
5. **No forced locale redirects on localized URLs.** Googlebot crawls from
   the US with no `Accept-Language`. Negotiate only at the `x-default` root
   (or show a suggestion banner), never for bots, and send `Vary`.
6. **Untranslated means unpublished in that locale.** Do not serve English
   main content at `/fr/...` with `hreflang="fr"`. Either 404 and drop it from
   hreflang and the sitemap, or redirect to the source page.
7. **The source locale is the single source of truth.** Humans and agents edit
   source strings and source documents only. Other locales are generated and
   then optionally overridden by reviewers through a lock or status, never by
   hand-editing generated files.
8. **No hardcoded user-facing strings.** That includes strings in data files,
   registries, alt text, aria labels, emails, form errors and JSON-LD. A lint
   gate enforces it on changed files.
9. **Three code systems, one config.** `lang` uses BCP 47 (`zh-Hans`),
   `hreflang` uses Google's subset (ISO 639-1 plus optional ISO 3166-1 or
   script, with no `es-419` and no `en-UK`), and `og:locale` uses `ll_CC`
   (`fr_FR`). Map all three in `i18n.config.json`.
10. **Brands are never translated.** Company, product, model, program,
    partner and person names, trademarks, standards, code and URLs are copied
    exactly. A native-script spelling (e.g. Japanese katakana) is allowed only
    when the owner approved it in `glossary.json`. See
    `references/09-what-to-translate.md`.
11. **Translation is delegated and validated.** The orchestrator never
    translates bulk content inline. It runs prep, then the translator
    subagent, then `apply`, which validates placeholders, glossary and
    length. Rejects go back for one retry and then to a human.
12. **One step, one approval, in plain language.** Explain, ask, do, report.
    Never act on a step the person has not approved.
13. **Live URLs do not change without a redirect map.** Any slug or URL
    strategy change ships with its 301/308 rules in the same deploy.
14. **Never commit, push or deploy without an explicit go in the current
    message.** Show the diff and the verification output, then stop.

## Workflow

Work through the phases in order. Each phase ends by updating the project's
`I18N-CHECKLIST.md`.

Phases 0 to 2 are read-only and end at the **approval gate**. Phases 3 to 8
run only after the user approves the plan, one step at a time.

### Phase 0: Detect

Find out what you are dealing with before proposing anything.

- **Stack:** read `package.json`, the framework config, and the rendering mode
  (SSG, ISR, SSR or SPA). Check for `output: 'export'`, `ssr: false`, or
  client-only routers.
- **Existing i18n:** look for an i18n library, message files, a `[locale]`
  segment, middleware or proxy, hreflang emission, and a sitemap generator.
- **Content sources:** code, message files, data registries
  (`src/content/*.ts`), Markdown/MDX, a headless CMS, or a builder (Webflow,
  WordPress).
- **The live site:** if a URL exists, run
  `node <skill>/scripts/i18n-verify-site.mjs --sitemap <url>/sitemap.xml --limit 40`
  for a baseline.
- **Project rules:** read the repo's `AGENTS.md`/`CLAUDE.md`. Project rules
  win over this skill, except where one would break a non-negotiable. In that
  case say so and ask.

### Phase 1: Audit and write the checklist

- **Delegate the audit** to the `i18n-auditor` agent (read-only; see "Model
  routing" below), or do it yourself on a small site.
- **Write the output** to `I18N-CHECKLIST.md` at the project root, built from
  `templates/I18N-CHECKLIST.md`. Every item gets a status (`PASS`, `FAIL`,
  `WARN`, `N/A`) and evidence (`file:line`, URL plus observed value, or
  command output). No status without evidence.
- **Measure hardcoded text:** run
  `node <skill>/scripts/i18n-scan-hardcoded.mjs src` to size the extraction
  work.
- **Build the translate / never-translate list:** run
  `node <skill>/scripts/i18n-messages.mjs suggest-glossary` and add the CMS
  brand, partner and product names. Draft `glossary.json` as a proposal
  (`references/09-what-to-translate.md`).
- **Report to the user:** P0 blockers first, then the decisions you need from
  them.

### Phase 2: Decide (ask the user, record the answers)

Ask only what you cannot infer. Recommend a default for each decision. Record
the answers in `i18n.config.json` (from `templates/i18n.config.json`) and in
`docs/I18N.md` (from `templates/I18N-DOC.md`).

- **Locales and tiers:**
  - Which locales, and what each one's review tier is (Tier 1 means a human
    reviews everything).
  - Language-only (`fr`) or language-region (`fr-CA`) codes. Default to
    language-only until there is real regional content.
- **URL shape:**
  - Subdirectory. The default locale unprefixed (`as-needed`) or prefixed.
  - Trailing-slash policy.
- **Slugs:** mirror the source slug (default; cheap and safe) or localized
  slugs (better click-through, needs a slug map and redirects on rename).
- **Fallback for missing translations:** 404 and omit (default), redirect to
  the source page, or noindex fallback.
- **Locale negotiation:** none (default), root-only, or a suggestion banner.
  Never on deep URLs.
- **CMS model per content type:** document-level or field-level (see
  `references/06-cms-and-blogs.md`).
- **Translation engine and budget:** tiered LLM via subagents (default),
  machine translation API, or a translation management system (TMS). Estimate
  the cost first with `i18n-messages.mjs stats`.

### Approval gate (mandatory)

Send the **audit-complete message** (template in
`references/10-working-with-operators.md`). It opens with "The audit is done.
Nothing on the site has been changed yet.", then gives a one-sentence
plain-language verdict. It covers:

- the checklist summary, with blockers and links to evidence
- the decisions, each with your recommended default
- the proposed glossary:
  - never-translate terms
  - forced terms
  - native-script spellings to approve or reject
- a numbered plan for Phases 3 to 8: files touched per step, packages added,
  URL changes and redirects, and the estimated translation cost per locale

Do not continue until the user says go. Then run the plan **one step per
approval** using the step loop (explain, ask, do, report). If they approve
only part of the plan, do only that part. Record each approval in the
checklist's change log.

### Phase 3: Foundation

- **Routing and rendering:** follow `references/frameworks/<stack>.md` for the
  routing, layout (`lang`, `dir`), metadata helper, sitemap, robots, language
  switcher and per-locale 404.
- **One function each, imported everywhere:**
  - A single **URL builder** used by canonical, hreflang, the sitemap, Open
    Graph, JSON-LD and breadcrumbs.
  - A single **alternates builder** that takes an optional
    available-translations map, so CMS pages advertise only the locales that
    exist.
- **Vendor the scripts.** Copy `scripts/` into the project as `scripts/i18n/`
  (zero dependencies, Node 18+), so CI and agents run the same code.

### Phase 4: Extract UI strings (Bucket 1)

- **Move user-facing literals into the source message file.** Use namespaced
  camelCase keys (`home.hero.title`). Follow `references/07-ui-and-content.md`
  for ICU plurals, `Intl` formatting and no concatenation.
- **Include hidden text:** data registries, alt and aria text, `<title>` and
  meta, JSON-LD strings, email templates and validation errors.
- **Add the lint gate** (`react/jsx-no-literals`,
  `@intlify/vue-i18n/no-raw-text`, or the scan script in CI). Gate changed
  files only, so legacy debt does not block the first PR.

### Phase 5: Translate (delegated)

Follow `references/05-translation-pipeline.md`. In short:

1. `node scripts/i18n/i18n-messages.mjs prep --config i18n.config.json`
   writes job files to `.i18n/jobs/`. A job holds the missing and stale keys
   per locale, batched, with glossary and context.
2. Spawn the **i18n-translator** subagent per job (parallel across locales).
   Use the cheap tier for UI strings and the balanced tier for long-form.
3. `node scripts/i18n/i18n-messages.mjs apply` validates each output and
   merges it into the locale files. Failures go to `.i18n/rejects/`; retry
   them once with the balanced tier, then list them for a human.
4. Run `node scripts/i18n/i18n-messages.mjs check`. It must exit 0.

### Phase 6: CMS and blogs (Bucket 2)

- **Model and fan-out:** follow `references/06-cms-and-blogs.md` for the
  document vs field model, fan-out on publish, the drift report, the slug
  policy, availability-aware hreflang, locale-filtered listings, RSS and
  search.
- **Long-form translation** uses the same subagent at the balanced tier, one
  document per job, structure-preserving (Portable Text, MDX or HTML node by
  node).

### Phase 7: Verify

- **Build** the site and serve it locally (or use a preview URL). Then run:
  - `i18n-verify-site.mjs` against the local or preview sitemap. Zero errors.
  - `i18n-messages.mjs check`. Zero errors.
  - The `curl` matrix in `references/04-rendering.md`. This proves the server
    HTML is localized and that bots are not redirected.
  - Typecheck and lint.
- **Update `I18N-CHECKLIST.md`** with the final statuses and evidence.
- **Report honestly:** what passes, what is still `WARN`, and what needs a
  human (Tier 1 review, legal copy, a redirect map to confirm).

### Phase 8: Guardrails

Install CI from `templates/github-workflow-i18n.yml`:

- the lint gate on changed files
- `i18n-messages.mjs check`
- the translate job when source strings change
- a weekly drift or verify job that fails loudly

A check that is always red gets ignored, so accept documented exceptions
explicitly instead of letting the job go red forever.

## Model routing

The orchestrator (you, on the main model) does detection, decisions, code and
verification. The bulk work goes to cheaper agents. Resolve model names at run
time; they change.

| Job | Claude Code | Codex CLI |
|---|---|---|
| Audit (read-only) | `i18n-auditor` agent (model `sonnet`) | `codex exec -p i18n-auditor -s read-only "<prompt>"` |
| UI strings, short copy, meta | `i18n-translator` agent (model `haiku`) | `codex exec -p i18n-translator "<prompt>"` (fast or affordable model, e.g. `gpt-6-luna`) |
| Long-form (blog, CMS body, legal) | `i18n-translator` with model override `sonnet` | `codex exec -p i18n-longform "<prompt>"` (workhorse model, low reasoning effort) |
| Retry of rejects | `sonnet` | `i18n-longform` |
| QA back-translation sample | `haiku` | `i18n-translator` |

- **Claude Code:** spawn with the Agent tool, `subagent_type: "i18n-translator"`,
  and `model: "sonnet"` for long-form. Run one agent per locale in parallel.
  When the skill is installed as a plugin, the agents are named
  `website-i18n:i18n-auditor` and `website-i18n:i18n-translator`. Use the name
  the Agent tool lists.
- **Skill path:** `<skill>` in commands is the folder this `SKILL.md` is in
  (the base directory shown when the skill loads). Pass it to the agents.
- **Codex:** profiles live at `~/.codex/<name>.config.toml`
  (`codex/` in the skill repo). To find the current cheap model, check
  `~/.codex/models_cache.json` for the one described as fast or affordable.
- **No subagents available?** Tell the user what bulk translation will cost on
  the main model and ask before doing it inline.
- **Prompting either kind of agent:** pass the job file path and the project
  root. The agent's instructions are self-contained.

## References

Load a reference only when its phase needs it.

| File | Read when |
|---|---|
| `references/01-checklist-guide.md` | Phase 1. How to verify each checklist item, with severity |
| `references/02-architecture.md` | Phase 2. URL strategy, codes, buckets, fallback, negotiation |
| `references/03-seo.md` | Phase 3 and 7. hreflang, canonical, sitemaps, robots, OG, JSON-LD |
| `references/04-rendering.md` | Phase 3 and 7. SSR/SSG/ISR per page type, the curl matrix, caching |
| `references/05-translation-pipeline.md` | Phase 5. Tiers, glossary, placeholders, staleness, cost |
| `references/06-cms-and-blogs.md` | Phase 6. Document vs field model, fan-out, drift, blog nuances |
| `references/07-ui-and-content.md` | Phase 4. ICU, Intl, expansion, CJK, RTL, fonts, switcher UX |
| `references/08-lessons-learned.md` | Before Phase 3. Real incidents and the check that catches each |
| `references/09-what-to-translate.md` | Phase 1 and 5. Translate vs never-translate (brands, products, acronyms), native-script spellings |
| `references/10-working-with-operators.md` | Always, before talking to the user. Step loop, plain-language templates, analogy bank, teaching lines |
| `references/frameworks/nextjs.md` | Next.js App Router (next-intl) and the Pages Router |
| `references/frameworks/astro.md` | Astro |
| `references/frameworks/nuxt.md` | Nuxt (`@nuxtjs/i18n`) |
| `references/frameworks/sveltekit.md` | SvelteKit (Paraglide) |
| `references/frameworks/static-ssg.md` | Hugo, Eleventy, plain HTML, Webflow, WordPress |

## Scripts

All scripts are zero-dependency Node 18+ ESM and print `--help`. Vendor them
into the project.

| Script | What it does |
|---|---|
| `scripts/i18n-messages.mjs` | Work on message files (JSON, nested, arrays supported). `suggest-glossary`: find brand and product names to protect. `stats`: size and cost estimate. `check`: parity, placeholders, glossary, identical-to-source, repeated brand words. `prep`: write translation jobs (missing, stale via source hashes, untranslated, invalid). `apply`: validate and merge translator output, write rejects. `validate`: check one job/output pair (for CMS adapters). `adopt`: baseline hashes. `pseudo`: pseudo-locale. |
| `scripts/i18n-docs.mjs` | Markdown/MDX documents (blogs). `prep`: jobs for missing or stale translated files. `check`: structure parity (frontmatter keys, headings, code blocks, links, components, images) plus the glossary. |
| `scripts/i18n-verify-site.mjs` | Crawl a sitemap or URL list without JS, as a bot with no `Accept-Language`. Checks status, `lang`/`dir`, self-canonical, hreflang validity, reciprocity and targets, `og:locale`, untranslated main content, sitemap vs head consistency, and optionally forced redirects. Outputs a Markdown report and an exit code. |
| `scripts/i18n-scan-hardcoded.mjs` | Heuristic count of hardcoded text in tsx/jsx/vue/svelte/astro/html templates, to size Phase 4 and to gate CI when no framework lint rule exists. |

## Templates

| File | Use |
|---|---|
| `templates/I18N-CHECKLIST.md` | Project checklist, filled in during Phase 1 and updated every phase after |
| `templates/i18n.config.json` | Locales with lang, hreflang, og and dir mapping, tiers, paths, glossary path, model tiers |
| `templates/glossary.json` | Do-not-translate terms and per-locale forced terms |
| `templates/I18N-DOC.md` | The project's i18n rulebook (decisions, buckets, workflows) for humans and agents |
| `templates/github-workflow-i18n.yml` | CI: lint gate, message check, translate on source change, weekly verify |
