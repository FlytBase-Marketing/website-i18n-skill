# 07: UI strings, formatting, layout and the language switcher

## Extracting strings

- **Source file only:** `messages/en.json` (or the stack's equivalent). The
  other locale files are generated.
- **Key naming:**
  - Namespaced by page or component, camelCase per segment, dot-separated:
    `home.hero.title`, `pricing.tier.enterprise.name`,
    `common.actions.save`, `common.errors.required`.
  - Never generic (`title1`, `text`) and never snake_case.
- **Every page namespace gets a `meta` sub-namespace** with `title` and
  `description`, for code-driven pages.
- **Look beyond JSX/template text:**
  - `alt`, `aria-label`, `title` and `placeholder` attributes
  - `<title>` and meta values, OG image text, JSON-LD names and descriptions
  - **data registries** (`src/content/*.ts`, constants arrays, nav configs).
    This is the biggest silent leak.
  - form validation and toast messages, and server error responses shown to
    users
  - transactional email templates and autoresponders (send in the
    submitter's locale)
  - `llms.txt` and other generated text files (decide whether they are
    source-only)
- **Arrays of strings** (bullets, feature lists) must be supported by your
  tooling. On the reference project, a tree walker that skipped arrays left
  raw keys (`reasons.drone.bullets`) rendering on every non-English locale.

### Lint gate (per stack)

| Stack | Rule |
|---|---|
| React (Next.js, Remix, Astro islands) | `react/jsx-no-literals` with `noStrings: true`, `ignoreProps: true`, plus an `allowedStrings` list (brand, single glyphs) |
| Vue / Nuxt | `@intlify/eslint-plugin-vue-i18n` with `@intlify/vue-i18n/no-raw-text` |
| Svelte, Astro templates, HTML | `scripts/i18n-scan-hardcoded.mjs --fail-on-new` against a baseline |

- **Rollout:** warn everywhere, and **fail CI only for files changed in the
  PR.** Each touched file gets cleaned. Legacy debt shrinks without a big-bang
  sweep.
- **Escape hatch:** a per-line disable with a reason, e.g.
  `// eslint-disable-next-line react/jsx-no-literals -- API code sample`.
- **Known ESLint quirk:** `disable-next-line` misses JSX text that begins on
  the comment's line. Collapse the element onto one line, use a block
  disable/enable, or move the literal into a `const`.

## Messages: ICU MessageFormat

```json
{
  "search.results": "{count, plural, =0 {No results} one {# result} other {# results}}",
  "cart.owner": "{gender, select, female {Her cart} male {His cart} other {Their cart}}",
  "footer.copyright": "© {year} FlytBase. All rights reserved.",
  "legal.agree": "I agree to the <terms>Terms</terms> and <privacy>Privacy Policy</privacy>."
}
```

- **Never concatenate:**
  - `t('a') + name + t('b')` breaks word order in ja, de and ar.
  - `count + ' items'` breaks plural rules. Russian and Arabic have
    one/few/many/other categories.
- **Rich text:** use tag placeholders (`<terms>...</terms>`) rendered by the
  library (`t.rich`), not split strings.
- **Always include an `other` branch.** Let CLDR plural rules decide which
  categories a locale needs.
- MessageFormat 2 became Unicode-stable in CLDR 47 (2025), but
  `Intl.MessageFormat` is still a TC39 proposal. Use MF1/ICU via your library
  for now.

## Formatting

| What | API | Note |
|---|---|---|
| Dates | `Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' })` | Explicit timezone on the server avoids hydration mismatches |
| Numbers | `Intl.NumberFormat(locale)` | `1,234.5` vs `1.234,5` vs `1 234,5` |
| Compact numbers | `Intl.NumberFormat(locale, { notation: 'compact' })` | Prefer this over translating "1.1M+" as prose. Prose can be 4x longer and break layouts |
| Currency | `Intl.NumberFormat(locale, { style: 'currency', currency })` | Currency is a business decision (per market or region), not derived from the language |
| Relative time | `Intl.RelativeTimeFormat` | |
| Lists | `Intl.ListFormat` | "A, B and C" |
| Sorting | `Intl.Collator(locale)` | For localized alphabetical lists |

`toLocaleDateString()` without a locale argument uses the server's locale.
Grep for it.

## Layout resilience

- **Text expansion:**
  - Strings of 10 characters or fewer can grow 200-300%. Long strings grow
    about 30%.
  - German, French and Russian are the usual stress tests.
  - **Keep fixed widths off text containers.** Allow buttons to wrap or
    shrink, and use `text-wrap: balance` on headings.
- **Animated counters and tickers:** if a localized value is not numeric,
  skip the count-up. Otherwise you get "0Plus de 1,1 million". Scale
  typography by the longest localized value.
- **Pseudo-locale for QA:** generate `en-XA`-style accented, 35%-padded
  strings (`[!!! Ṕŕîçîñĝ !!!]`) to find clipping and hardcoded text before
  real translations exist.
- **CJK:**
  - Korean: `word-break: keep-all`. Japanese: `line-break: strict`.
  - Allow more `line-height`.
  - No italics for emphasis; use weight.
  - Load CJK fonts per locale (subset or `unicode-range`). Never ship them
    to Latin-locale pages.
- **RTL (ar, he, fa, ur):**
  - `dir="rtl"` on `<html>`.
  - Logical properties everywhere: `margin-inline-start`, `padding-inline`,
    `inset-inline-end`, `text-align: start`. In Tailwind: `ms-*`, `me-*`,
    `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`.
  - Mirror directional icons (`rtl:-scale-x-100`), but not logos, media
    controls or checkmarks.
  - `<bdi>` or `dir="auto"` for user-generated or mixed text.
  - Test every template at `/ar` before launch.
- **Images with text:** use per-locale assets, or no baked-in text.

## Brand protection in markup

- `<span translate="no">FlytBase</span>` keeps browser translators (Chrome,
  Google Translate) from translating brand names.
- Keep brand and program names in the glossary `doNotTranslate` list, so the
  pipeline enforces them too.

## Language switcher

- A list of **`<a href>` links** to the **equivalent page** in each
  available locale, rendered in the server HTML. A `<select>` that only calls
  `router.replace` is not crawlable.
- **Native names:** English, Deutsch, Français, Español, Português, 日本語,
  한국어, 简体中文, Русский, العربية.
  - **No flags.** Flags are countries, not languages.
  - Never ASCII-flattened labels ("Francais", "Espanol"). Use the real
    characters.
- On each link: `lang="de"` and `hreflang="de"`, plus `aria-current` on the
  active locale.
- **Use the same availability data as hreflang.** On a CMS page missing a
  French variant, hide French or link to the French parent (`/fr/blog`).
  Never link to a 404.
- **Localized slugs:** the link target is the variant's own slug, not the
  current slug with the prefix swapped.
- **Persist the choice** in a cookie (`NEXT_LOCALE`, `i18n_redirected`) when
  clicked. It overrides any negotiation.
- **Optional suggestion banner:** "This page is available in Deutsch."
  Dismissible, remembered, and never a redirect.

## Forms and emails

- Send the active locale with every form submission and store it on the lead
  or contact.
- Localize validation messages and server error messages.
- Autoresponders and confirmation emails use the submitter's locale, falling
  back to the source.
- Internal notifications (Slack, CRM) can stay in the team's language. Still
  include the submitter's locale as a field.
