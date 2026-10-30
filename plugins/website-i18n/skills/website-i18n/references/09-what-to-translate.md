# 09: What to translate, and what never to translate

Before any translation run, every piece of text falls into one of three
classes. The auditor proposes the classification, the owner confirms it, and
it is stored in `i18n/glossary.json`. The translator agent and the `apply`
validator enforce it.

## The three classes

| Class | Rule | Examples |
|---|---|---|
| **Translate** | Translate naturally for the market, following the style guide | Headlines, body copy, buttons, nav labels, form labels and errors, meta title and description, alt text, aria labels, FAQ, blog bodies, generic terms ("drone-in-a-box", "remote operations", "fleet") unless the glossary forces a term |
| **Never translate** (`doNotTranslate`) | Copy exactly, letter for letter. No translation, no transliteration, no case change, no added spaces, no repeats | Brand and company names (FlytBase, DJI, Microsoft). Product, platform and feature names (FlytNow, FlightHub 2, DJI Dock 3, Matrice 4TD). Program and event names (10x Partner Academy, FlytLaunch). Partner and customer names. Person names. Trademarks (™ and ® terms). Certifications and standards (ISO 27001, SOC 2, GDPR). Code, API paths, CLI commands, file names, URLs, emails, phone numbers, handles. Placeholders (`{name}`, `<tag>`) |
| **Forced term** (`terms[locale]`) | Always translate this source term to one approved target term | Market terminology: fr "dock" = "station d'accueil", de "Sie" form, ja industry terms the sales team uses. Keeps one term per concept across the whole site |

## Brand names in a locale's own script

The default for brands is **Latin script, exactly as written**, in every
locale: "FlytBase" stays "FlytBase" in ja, zh, ko, ru and ar.

Some markets do write brands in their own script. Japanese uses katakana for
some foreign brands, and Russian sometimes uses Cyrillic. That is a **brand
decision, not a translator decision**. When the owner approves a
native-script spelling, record it per locale:

```json
{
  "doNotTranslate": [
    "DJI",
    { "term": "FlytBase", "allow": { "ja": ["フライトベース"] }, "note": "Katakana approved by marketing JP, 2026-10" }
  ]
}
```

- The translator may use **only** the approved spellings, and only in that
  locale.
- Anything else fails validation and is rejected: a different transliteration
  (ディージェイアイ for DJI), a translation ("Base de vol"), or a dropped
  brand.
- Mixed forms on one page look sloppy. If a native form is approved, prefer
  it consistently in body text. Keep the Latin form in the logo, legal names,
  URLs and structured data (`Organization.name`).

## Brand plus generic words

Translate the words around a brand naturally, and keep the brand string
intact:

| Source | fr | ja |
|---|---|---|
| "FlytBase for mining" | "FlytBase pour l'exploitation minière" | "鉱業向け FlytBase" |
| "Book a DJI Dock 3 demo" | "Réservez une démo du DJI Dock 3" | "DJI Dock 3 のデモを予約" |
| "FlytBase vs. FlightHub 2" | unchanged (all proper nouns) | unchanged |

Word order may move the brand. That is fine, as long as the brand string
itself is untouched and appears exactly as often as the meaning requires.
Never doubled: "FlytBase FlytBase..." was a real machine-translation artifact
in 46 ja and zh strings.

## Acronyms: decide one by one

Acronyms are not automatically brands.

- **Usually localized:** AI (fr and es "IA", ru "ИИ"), FAQ in some markets.
- **Usually kept:** API, ROI (market-dependent), BVLOS, GPS, SCADA, ISO.
- **Rule:** if the target market's professionals use the English acronym, add
  it to `doNotTranslate`. If they use their own, add it as a forced term per
  locale (`"terms": { "fr": { "AI": "IA" } }`). Never leave it to chance.
  Inconsistent acronyms across pages read as low quality.

## Things that look like text but are not

Never send these to the translator. The extraction and prep steps exclude
them:

- message values that are URLs, asset paths, hex colors, CSS classes,
  numbers-only strings, or ICU syntax without visible text
- keys starting with `_` (comments)
- code samples, inline code, JSON or CLI examples in docs and blogs
- data that is not prose: SKUs, dimensions, model codes, coordinates, dates
  (formatted with `Intl`, not translated)

## How the classification gets built (audit step)

1. `node scripts/i18n-messages.mjs suggest-glossary --config i18n.config.json`
   lists brand-like terms found in the source strings: CamelCase brands, name
   plus model number, trademarks, and acronyms, with counts.
2. The auditor adds terms from other sources:
   - the CMS (partner names, customer names, product catalog)
   - the nav and footer
   - logo alt text
   - JSON-LD `Organization` and `Product` names
3. **The owner confirms the list** (keep, drop, or forced term) and any
   approved native-script spellings. This happens at the audit gate, before
   any translation.
4. In markup, wrap brand names in `translate="no"`
   (`<span translate="no">FlytBase</span>`) so browser translators leave them
   alone too.
5. CI runs `check` on every locale file. A brand that was translated,
   transliterated, dropped or doubled fails the build.

## Updating the glossary later

- Adding a term: run `check`. Every existing translation that broke the term
  now fails, and the next `prep` re-queues it with reason `invalid`.
- New product launch: add the product name to the glossary **before** the
  copy lands in the source file, so the first translation is already right.
