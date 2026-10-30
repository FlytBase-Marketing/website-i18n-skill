# 05: Translation pipeline

The orchestrator never translates bulk text itself. The pipeline is
**deterministic prep, then a cheap model, then deterministic validation.**
The model's only job is language. Scripts handle diffing, batching, merging,
key order and checking.

```
source change ──► prep ──► .i18n/jobs/<locale>.<n>.json
                                │
                    i18n-translator subagent (cheap tier, parallel per locale)
                                │
                     .i18n/out/<locale>.<n>.json
                                │
                apply ──► validated merge into messages/<locale>.json
                  │                + .i18n/source-hashes.json updated
                  └──► .i18n/rejects/<locale>.json ──► retry once (balanced tier) ──► human list
```

## Model tiers

Set the tiers in `i18n.config.json -> translation.tiers`. Resolve the actual
model at run time: aliases in Claude Code, `~/.codex/models_cache.json` in
Codex.

| Tier | Use for | Claude Code | Codex | Why |
|---|---|---|---|---|
| `fast` | UI strings, meta titles and descriptions, alt text, short CMS fields | `haiku` | fast or affordable model (e.g. `gpt-6-luna`), effort low | Short, high volume, context-light. Validation catches structural errors |
| `balanced` | Blog bodies, case studies, legal, marketing long-form, retries of rejects | `sonnet` | workhorse model (e.g. `gpt-6.1-sol`), effort low | Tone, coherence across paragraphs, rich-text structure |
| `review` (optional) | Back-translation spot-check of a sample per locale | `haiku` | fast model | Flags meaning drift for human attention. Never auto-edits |

The main model (Opus or the default Codex model) is for architecture,
code and judgment calls, not bulk translation.

Cost sense (UI strings): a 1,500-key site is ~60k source characters, roughly
15k tokens in and 20k tokens out per locale. On the fast tier, all locales
together typically cost cents to low dollars. Long-form dominates spend, so
use `stats` before a big run and tell the user the estimate. A machine
translation API (Google, DeepL) is the alternative at about $20 per 1M
characters. It needs the same validation step and is weaker on tone and
glossary.

## Job file format (written by `prep`, read by the translator)

```json
{
  "version": 1,
  "job": "fr.001",
  "sourceLocale": "en",
  "targetLocale": "fr",
  "targetLanguage": "French",
  "tier": "fast",
  "style": "Professional B2B. Formal 'vous'. Short, direct UI labels.",
  "glossary": {
    "doNotTranslate": ["FlytBase", "FlytNow", "Dock 3"],
    "terms": { "drone-in-a-box": "drone-in-a-box", "BVLOS": "BVLOS" }
  },
  "items": [
    { "key": "home.hero.title", "source": "Autonomous drone operations at scale", "context": "H1 on homepage, max ~60 chars" },
    { "key": "search.results", "source": "{count, plural, =0 {No results} one {# result} other {# results}}" }
  ],
  "output": ".i18n/out/fr.001.json"
}
```

## Output format (written by the translator)

```json
{ "job": "fr.001", "targetLocale": "fr", "translations": { "home.hero.title": "...", "search.results": "..." } }
```

Every key from `items` must appear exactly once. Values are strings only.

## Validation (`apply` and `validate`)

A translation is **rejected** when any of these hold:

- it is missing or empty, or its key is unknown
- **ICU argument set differs** from the source (`{name}`, `{count, plural, ...}`)
- a **plural or select structure is lost**, or the `other` branch is missing
- the **tag set differs**: `<b>`, `<0>`, `</link>`, HTML tags
- the **URL or Markdown link target set differs**
- a **do-not-translate term** in the source is missing, translated or
  transliterated
- a **do-not-translate term is repeated** ("FlytBase FlytBase") when the
  source does not repeat it. This is a real machine translation artifact seen
  in ja and zh.
- a **forced glossary term** is missing for that locale
- it is **identical to the source** for a non-Latin-script target, or the
  source is long. Short identical Latin strings (`Email`, `OK`) only produce a
  warning.
- the **length ratio** is below 0.2 (truncated)

**Warnings** (merged, but listed): length ratio above the limit (likely
layout overflow), identical short strings.

Configurable `replace` rules run before validation. Example: normalize em
dashes to hyphens when the project bans them.

## Staleness: re-translate only what changed

- `.i18n/source-hashes.json` records, per locale and key, the hash of the
  source string each translation was made from. `prep` re-queues a key when
  the current source hash differs. Translations without a record are adopted
  as the baseline the first time (`adopt` writes it explicitly).
- **Reviewer overrides:** add a key or prefix (`legal.*`) to
  `.i18n/locked.json` under the locale. `prep` will still fill it if it is
  missing, but never refreshes it.
- **Alternative used by the reference project:** diff the source file
  against `HEAD~1` and clear the changed keys in every locale. This needs
  `fetch-depth: 2` in CI, or it silently degrades to fill-only. It also
  overwrites manual edits. Hashes are more robust.

## Glossary (`i18n/glossary.json`)

```json
{
  "doNotTranslate": ["FlytBase", "FlytNow", "10x Partner Academy", "DJI Dock 3", "ISO 27001"],
  "terms": {
    "fr": { "drone-in-a-box": "drone-in-a-box", "dock": "station d'accueil" },
    "de": { "dock": "Dock" }
  },
  "style": {
    "default": "Professional B2B, concise, no exclamation marks.",
    "de": "Sie-Form.", "fr": "Vouvoiement.", "ja": "Desu/masu form.", "ko": "Formal -습니다 style."
  }
}
```

- **Program and product names are proper nouns.** The reference project had
  "10x Partner Academy" translated in some keys and literal in others within
  the same locale. Put every proper noun in `doNotTranslate`.
- **UI render protection:** wrap brand terms in `translate="no"` in markup so
  browser translators leave them alone too.

## Rich text and documents

Never send raw HTML, MDX or Portable Text and hope. Send text nodes only.

- **Portable Text** (Sanity): collect `span.text` per block, translate with
  the block as context, and write back by position. Preserve `_key`, `marks`,
  `markDefs`, `style`, `listItem` and non-block types. Known limit: a sentence
  split across marked spans is translated fragment by fragment. To improve
  this, send the whole block with inline tags (`<0>bold</0>`) and map back.
- **Markdown/MDX:**
  - **Translate:** prose and headings.
  - **Never touch:** code fences, inline code, import/export lines, JSX
    component names and props (except string props marked translatable),
    link URLs, and frontmatter keys.
  - **Frontmatter:** translate `title`, `description` and `excerpt`. Copy the
    rest. Add `sourceHash`, `translatedFrom` and `translationStatus: auto`.
- **HTML:** translate text nodes and `alt`/`title`/`aria-label`/`placeholder`
  attributes only.
- **Validate the structure:** same block count, same heading levels, same
  code blocks byte for byte, same link targets, same component tags.
  `i18n-docs.mjs check` does this for Markdown/MDX.

## Review tiers per locale

| Tier | Markets | Machine output | Human |
|---|---|---|---|
| 1 | Revenue-critical | Draft | Reviews all titles, meta, CTAs, legal, and the top 20 pages before indexing |
| 2 | Growth | Published | Reviews titles, meta, CTAs, legal |
| 3 | Experimental | Published for core pages only | Back-translation sample. Do not mass-publish thin pages |

CMS variants carry a status (`auto`, `needs-review`, `reviewed`) plus the
source revision they were reviewed against. A stale state is derived by
comparing that revision to the current source, never stored.

## CI

- **On push to main** when the source messages change: run `prep`, then the
  translator (provider API key in CI secrets, or a machine translation API),
  then `apply` and `check`, then commit as a bot.
  - The bot identity must pass the deploy pipeline's author checks (Vercel
    author verification blocked unverified bot commits in the reference
    project).
  - Skip the run when the head commit is the bot's, to avoid loops.
  - Use a `concurrency` group.
- **On every PR:** run `check`. It fails on missing keys or placeholder
  mismatches.
- **Fail loudly.** Never commit partial locale files. Never auto-merge a run
  that produced rejects without listing them.
