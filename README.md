# website-i18n skill

An agent skill (Claude Code and Codex) that makes any website properly
multilingual. The skill:

- audits first, then works step by step with approval for each step
- explains every step in plain language to non-technical operators
- sets up server-rendered localized pages, hreflang, canonicals and localized
  sitemaps
- extracts UI strings
- translates through cheaper models with deterministic validation
- never translates brand names

It is built from the FlytBase-26 production setup (Next.js 16, next-intl,
Sanity, 9 locales), Google Search Central, W3C and framework docs.

## What's inside

```
website-i18n-skill/                      # git repo = Claude Code plugin marketplace
├── HANDOVER.md                          # start here if you are new to this
├── .claude-plugin/marketplace.json      # marketplace "flytbase-website-i18n"
├── plugins/website-i18n/                # THE PLUGIN
│   ├── .claude-plugin/plugin.json
│   ├── skills/website-i18n/             # THE SKILL (folder name = skill name)
│   │   ├── SKILL.md                     # workflow, gates, non-negotiables, model routing
│   │   ├── references/
│   │   │   ├── 01-checklist-guide.md    # how to audit with evidence
│   │   │   ├── 02-architecture.md       # URL strategy, codes, buckets, fallback, negotiation
│   │   │   ├── 03-seo.md                # hreflang, canonical, sitemaps, OG, JSON-LD
│   │   │   ├── 04-rendering.md          # SSR/SSG/ISR per page type, curl matrix, caching
│   │   │   ├── 05-translation-pipeline.md
│   │   │   ├── 06-cms-and-blogs.md      # doc vs field level, fan-out, drift, blog details
│   │   │   ├── 07-ui-and-content.md     # ICU, Intl, layout, RTL, CJK, switcher
│   │   │   ├── 08-lessons-learned.md    # 20+ real incidents and the check for each
│   │   │   ├── 09-what-to-translate.md  # brands/products never translated, native spellings
│   │   │   ├── 10-working-with-operators.md  # step loop, plain-language templates, analogies
│   │   │   └── frameworks/              # nextjs, astro, nuxt, sveltekit, static-ssg
│   │   ├── scripts/                     # zero-dependency Node 18+ tools
│   │   │   ├── i18n-messages.mjs        # suggest-glossary, stats, check, prep, apply, validate, adopt, pseudo
│   │   │   ├── i18n-docs.mjs            # Markdown/MDX blog jobs + structure check
│   │   │   ├── i18n-verify-site.mjs     # no-JS crawl: hreflang, canonical, lang, sitemap, redirects
│   │   │   └── i18n-scan-hardcoded.mjs  # find hardcoded text in templates
│   │   └── templates/                   # I18N-CHECKLIST.md, i18n.config.json, glossary.json,
│   │                                    # I18N-DOC.md, github-workflow-i18n.yml
│   └── agents/
│       ├── i18n-auditor.md              # read-only auditor (sonnet), writes the checklist + plan
│       └── i18n-translator.md           # job translator (haiku; sonnet for long-form)
├── codex/                               # Codex profiles (gpt-6-luna / gpt-6.1-sol) + README
└── install.sh                           # for Codex, or Claude Code without plugins
```

## Install

**Claude Code (recommended): as a plugin.** In any Claude Code session:

```
/plugin install website-i18n --marketplace FlytBase-Marketing/website-i18n-skill
```

The repo is private, so your machine needs GitHub access first: run
`gh auth login` and then `gh auth setup-git` once. Updates:
`/plugin marketplace update flytbase-website-i18n`, or turn on auto-update in
`/plugin` > Marketplaces.

**Codex, or Claude Code without plugins:**

```bash
git clone https://github.com/FlytBase-Marketing/website-i18n-skill.git
cd website-i18n-skill && ./install.sh        # --codex or --claude to limit
```

Update with `git pull` (the script symlinks, so changes apply at once).

Restart Claude Code or Codex. Then, in a website repo:

> "Make this site i18n-ready for French, German and Japanese"

The agent will:

1. **Audit** (read-only): stack, routes, live HTML, message files, brand
   names. It writes `I18N-CHECKLIST.md`.
2. **Explain** the result in plain words and propose decisions, a
   never-translate list, and a numbered plan.
3. **Wait for your OK**, then do **one step per approval**: explain, ask, do,
   report with proof.
4. **Translate** with cheap subagents in parallel. Every output is checked
   (placeholders, tags, brand names, glossary) before it is merged.

## How translation stays cheap and correct

```
prep (script) -> translator agent (cheap model, per locale, parallel) -> apply (script validates + merges)
                                                                           -> rejects retried on a mid model, then a human
```

| Work | Claude Code | Codex |
|---|---|---|
| Audit | `i18n-auditor` (sonnet; `website-i18n:i18n-auditor` as a plugin) | `codex exec -p i18n-auditor` |
| UI strings | `i18n-translator` (haiku) | `codex exec -p i18n-translator` (gpt-6-luna) |
| Blogs, long-form, retries | `i18n-translator` with model sonnet | `codex exec -p i18n-longform` (gpt-6.1-sol, low effort) |

## Using the scripts directly

```bash
S=<repo>/plugins/website-i18n/skills/website-i18n/scripts
node $S/i18n-messages.mjs suggest-glossary --dir src/messages     # brand/product names to protect
node $S/i18n-messages.mjs check --dir src/messages                # CI gate
node $S/i18n-verify-site.mjs --sitemap https://site.com/sitemap.xml --limit 40 --negotiation --report verify.md
node $S/i18n-scan-hardcoded.mjs src --top 20
node $S/i18n-docs.mjs check --source content/blog/en --target 'content/blog/{locale}' --locales fr,de
```

Every script prints `--help`.
