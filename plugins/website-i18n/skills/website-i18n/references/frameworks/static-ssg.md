# Static sites: Hugo, Eleventy, plain HTML, Webflow, WordPress

Static output is ideal for i18n SEO, as long as every locale is a **built
page**, not a JS swap.

## Hugo (built-in multilingual)

```toml
# hugo.toml
baseURL = 'https://site.com/'
defaultContentLanguage = 'en'
defaultContentLanguageInSubdir = false     # as-needed; true = /en/ prefix
[languages.en]
  languageCode = 'en-US'
  languageName = 'English'
  weight = 1
[languages.fr]
  languageCode = 'fr-FR'
  languageName = 'Français'
  weight = 2
[languages.ar]
  languageCode = 'ar'
  languageName = 'العربية'
  languageDirection = 'rtl'
  weight = 3
```

- **Content:** a filename suffix (`post.fr.md`) or a `contentDir` per
  language. Pages with the same path, or the same `translationKey`
  frontmatter, are linked as translations.
- **UI strings:** `i18n/en.toml`, `i18n/fr.toml` (JSON/YAML also work), with
  `{{ T "home.hero.title" }}`. Plurals use `one`/`other` maps.
- **hreflang in the head partial:**
  ```go-html-template
  <link rel="canonical" href="{{ .Permalink }}">
  {{ range .AllTranslations }}<link rel="alternate" hreflang="{{ .Language.LanguageCode | lower }}" href="{{ .Permalink }}">{{ end }}
  {{ with (index .AllTranslations 0) }}<link rel="alternate" hreflang="x-default" href="{{ .Permalink }}">{{ end }}
  ```
  `.AllTranslations` includes only the translations that exist, so it is
  availability-aware by construction. Make sure the `x-default` target is the
  source-language page (sort by weight).
- **Templates:** `<html lang="{{ .Language.LanguageCode }}" dir="{{ .Language.LanguageDirection | default "ltr" }}">`.
- **Sitemap:** Hugo's multilingual sitemap template emits `xhtml:link`
  alternates per translation. Check the output once.
- **Staleness:** keep `sourceHash` in frontmatter. Validate translated
  Markdown with `scripts/i18n-docs.mjs check`.

## Eleventy

- Use `EleventyI18nPlugin` with `defaultLanguage`. Organize content as
  `src/en/...` and `src/fr/...`, with a directory data file setting `lang`
  per folder.
- The `locale_links` filter returns the other-locale versions that exist.
  Use it for hreflang and the switcher. `locale_url` maps a path to the
  current locale.
- UI strings: a global data file per locale (`_data/i18n/en.json`) plus a
  `t` filter.
- Sitemap: a Nunjucks or JS template iterating `collections.all` grouped by
  `translationKey`.

## Plain HTML (hand-built or generated)

- Generate `/fr/...` files at build time from templates plus message files
  (any templating: Nunjucks, Handlebars, a small Node script).
- **Never** ship one HTML page plus a JS translation library that swaps text
  at runtime. Crawlers see the source language only.
- Write the head (lang, dir, canonical, hreflang, og) from one build-time
  helper. Write `sitemap.xml` with alternates from the same data.

## Webflow

- **Webflow Localization:** per-locale subdirectories, server-rendered, with
  hreflang emitted automatically. Check these:
  - the locale slugs
  - `x-default`
  - that CMS items untranslated in a locale do not publish at the localized
    URL with English content
  - the localized SEO title and description fields
  - the sitemap toggle per locale
  - machine-translated locales are reviewed before publishing
- Third-party JS widgets (client-side Weglot or GTranslate modes) fail the
  rendering rule. Use their subdirectory or proxy (server-rendered) mode, or
  native Localization.

## WordPress

- WPML or Polylang (posts per language, linked). TranslatePress also works.
  Confirm that hreflang is in the server HTML and that the switcher links to
  equivalents.
- Use language subdirectories (`/fr/`), not `?lang=fr`.
- With Yoast or Rank Math, confirm only one plugin emits hreflang and that
  the sitemap lists translations.

## Any SaaS builder or translation proxy

Test with the curl matrix (`04-rendering.md`). If `curl /fr/page` does not
contain the French text, the setup fails, whatever the vendor claims.
