# Nuxt (`@nuxtjs/i18n`)

Nuxt renders on the server by default (`ssr: true`), and `nuxi generate`
prerenders. Never set `ssr: false` for a localized marketing site. Option
names below are from `@nuxtjs/i18n` v9/v10. Verify against the installed
version at i18n.nuxtjs.org.

## Config

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n', '@nuxtjs/sitemap'],
  site: { url: 'https://site.com' },
  i18n: {
    baseUrl: 'https://site.com',                 // required for absolute hreflang/canonical
    strategy: 'prefix_except_default',           // as-needed equivalent; 'prefix' = always. Never 'no_prefix' for SEO
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'fr', language: 'fr-FR', name: 'Français', file: 'fr.json' },
      { code: 'ar', language: 'ar', name: 'العربية', file: 'ar.json', dir: 'rtl' },
    ],
    langDir: 'locales',                          // lazy-loaded message files
    detectBrowserLanguage: false,                // or { useCookie: true, redirectOn: 'root' }, never 'all'
    // customRoutes: 'config', pages: { about: { fr: '/a-propos' } }   // localized paths, if decided
  },
})
```

- `language` drives the hreflang value. Use Google's subset (`fr` or
  `fr-FR`, never `es-419`). `code` is the URL segment.
- `detectBrowserLanguage.redirectOn: 'root'` restricts redirects to `/`.
  Never use `'all'`.

## Head (hreflang, canonical, lang, dir, og)

```vue
<!-- layouts/default.vue -->
<script setup lang="ts">
const head = useLocaleHead()   // emits lang/dir attrs, hreflang links, og:locale(+alternate), canonical
</script>
<template>
  <Html :lang="head.htmlAttrs.lang" :dir="head.htmlAttrs.dir">
    <Head>
      <template v-for="link in head.link" :key="link.key"><Link :id="link.key" :rel="link.rel" :href="link.href" :hreflang="link.hreflang" /></template>
      <template v-for="meta in head.meta" :key="meta.key"><Meta :id="meta.key" :property="meta.property" :content="meta.content" /></template>
    </Head>
    <Body><slot /></Body>
  </Html>
</template>
```

- Check the generated output for an `x-default` entry. Add one if your
  version does not emit it.
- `useLocaleHead` lists **every** configured locale. For CMS pages with
  partial translations, override the links per page from the CMS
  availability data, or filter in a composable.
- Localized dynamic slugs: `useSetI18nParams({ fr: { slug: 'titre-fr' } })`
  so the switcher and hreflang get each locale's slug.

## Navigation

Use `useLocalePath()` / `<NuxtLinkLocale>` for internal links, and
`useSwitchLocalePath()` for the switcher. Render the switcher as real `<a>`
links.

## Messages and formatting

- vue-i18n ICU-like syntax (`{count}`, plural with `|`), or enable ICU via
  `@intlify` message compiler options. Pick one and validate placeholders in
  CI (`i18n-messages.mjs check` understands `{name}` and `@:linked`
  references as placeholders).
- `$d` and `$n` with `datetimeFormats` / `numberFormats`, or `Intl`
  directly.

## Content (blogs)

- **Nuxt Content:** `content/en/blog/*.md` and `content/fr/blog/*.md`, or
  collections per locale. Query by locale. Link variants with a
  `translationKey`.
- **Headless CMS:** pass `locale.value` to queries and 404 when the variant
  is missing (`throw createError({ statusCode: 404 })`).

## Sitemap

`@nuxtjs/sitemap` integrates with `@nuxtjs/i18n` and adds alternates
automatically for static routes. For dynamic CMS routes, supply entries with
`_i18nTransform` or explicit `alternatives`. Only list the available locales.

## Lint

```js
// eslint: @intlify/eslint-plugin-vue-i18n
rules: { '@intlify/vue-i18n/no-raw-text': ['warn', { ignorePattern: '^[-#:()&/+·]+$' }] }
```
