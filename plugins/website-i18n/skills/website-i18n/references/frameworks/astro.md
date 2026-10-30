# Astro

Astro is static by default (SSG), which is the ideal rendering mode. Use the
built-in i18n routing (Astro 4+). Verify the option names against the
installed version at docs.astro.build/en/guides/internationalization/.

## Config

```js
// astro.config.mjs
export default defineConfig({
  site: 'https://site.com',              // required for absolute URLs
  trailingSlash: 'never',                // pick one, keep it everywhere
  i18n: {
    locales: ['en', 'fr', 'de', 'ja'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false, redirectToDefaultLocale: false },
    // fallback: { fr: 'en' },           // AVOID for indexable content: see below
    // fallbackType: 'redirect',         // 'rewrite' serves English at /fr: never index that
  },
  integrations: [sitemap({ i18n: { defaultLocale: 'en', locales: { en: 'en', fr: 'fr', de: 'de', ja: 'ja' } } })],
})
```

- **Pages:** either `src/pages/[locale]/...` with
  `getStaticPaths() => locales.map(...)`, or folders per locale
  (`src/pages/fr/...`). Prefer `[locale]` with one template per page type.
- **Helpers from `astro:i18n`:** `getRelativeLocaleUrl(locale, path)`,
  `getAbsoluteLocaleUrl(locale, path)`, `getAbsoluteLocaleUrlList(path)`.
  Use them inside your single `urlFor`.
- **Current locale:** `Astro.currentLocale`. Use `Astro.preferredLocale` only
  for a root suggestion banner, never for redirects of deep URLs.

## Messages

Astro has no built-in message catalog. Options:

- a JSON per locale plus a tiny `t(locale, key, vars)` helper with
  `Intl.PluralRules`
- `@inlang/paraglide-js` (compiled messages, tree-shaken)
- `i18next` server-side only

Render on the server, in `.astro` templates. Islands receive already
translated props, or only their own namespace.

## Content collections (blog)

```
src/content/blog/en/drone-safety.md
src/content/blog/fr/drone-safety.md      # same file name = mirrored slug
```

- Frontmatter: `title`, `description`, `translationKey`, `sourceHash`,
  `translationStatus`.
- `getStaticPaths` for `[locale]/blog/[slug]`: emit only the entries that
  exist in that locale folder.
- hreflang for a post: collect all entries sharing a `translationKey`, then
  map each to `getAbsoluteLocaleUrl(entryLocale, '/blog/' + entrySlug)`.

## Head component

One `<SeoHead>` component per layout, fed by a single helper:

- `<html lang={langTag}>` and `dir`
- a self canonical
- `<link rel="alternate" hreflang>` for **available** locales, plus
  `x-default`
- `og:locale` and `og:locale:alternate`
- JSON-LD with `inLanguage`

Render it once, in the layout.

## Sitemap

- `@astrojs/sitemap` with `i18n` emits `xhtml:link` alternates. It **assumes
  the same path in every locale** and that every listed locale exists for
  every page.
- For partially translated collections or localized slugs, use `filter` and
  `serialize` to set `links` per entry from your `translationKey` map, or
  write a custom `sitemap.xml.ts` endpoint.

## Fallback

`fallback` with `fallbackType: 'rewrite'` serves the default locale's content
at `/fr/...`. That is English indexed under French: a P0. If you use it, add
`noindex` plus a canonical to the source on those pages and drop them from
hreflang and the sitemap. The default `redirect` fallback is safer. Not
generating the page at all is the safest.

## Lint and hardcoded text

There is no first-party rule for `.astro` templates. Use
`scripts/i18n-scan-hardcoded.mjs src --ext astro,tsx,jsx` in CI with a
baseline. Use `react/jsx-no-literals` for React islands.

## SSR adapters

With `output: 'server'` or `'hybrid'`, set `export const prerender = true` on
marketing pages. Keep negotiation (if any) in middleware for `/` only, with
`Vary`.
