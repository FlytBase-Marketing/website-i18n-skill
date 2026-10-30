# SvelteKit (Paraglide JS)

Paraglide (inlang) compiles messages to tree-shakable functions and has
first-class SvelteKit SSR support. Verify the API against the installed
Paraglide major version (2.x at the time of writing) at inlang.com and
paraglidejs.com.

## Setup

```bash
npx @inlang/paraglide-js@latest init
```

This creates `project.inlang/settings.json` (base locale, locales,
message path pattern `messages/{locale}.json`) and the Vite plugin.

```js
// vite.config.js
paraglideVitePlugin({
  project: './project.inlang',
  outdir: './src/lib/paraglide',
  strategy: ['url', 'cookie', 'baseLocale'],   // URL first; never 'preferredLanguage' on deep URLs
})
```

```ts
// src/hooks.server.ts
export const handle: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request, locale }) => {
    event.request = request
    return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', locale) })
  })

// src/hooks.ts
export const reroute: Reroute = (request) => deLocalizeUrl(request.url).pathname
```

- `src/app.html`: `<html lang="%lang%" dir="%dir%">`. Replace `%dir%`
  similarly for RTL locales.
- Messages: `import { m } from '$lib/paraglide/messages'`, then
  `m.home_hero_title()`. Paraglide keys are flat identifiers, so map
  namespaces to snake_case or dot-free keys.
- Links: `localizeHref('/pricing')` (current locale) and
  `localizeHref(path, { locale: 'fr' })` for the switcher.
- With SSR plus the URL strategy, make sure the server-chosen locale is the
  one the client hydrates with (a cookie in the strategy chain, and
  per-request `AsyncLocalStorage` in the middleware). Otherwise you get
  hydration mismatches.

## Rendering

- Marketing routes: `export const prerender = true` in `+layout.ts` or
  `+page.ts`. Provide `entries()` for each locale-prefixed path (or rely on
  the crawler following localized links).
- CMS routes: `+page.server.ts` `load({ params })` fetches by locale and
  slug, and calls `error(404)` when the variant is missing.

## Head

Write a `<Seo>` component used in `+layout.svelte` via `<svelte:head>`:

- canonical from the single `urlFor`
- hreflang for available locales plus `x-default`
- `og:locale`
- JSON-LD `inLanguage`

Get availability per page from `load` data.

## Sitemap

Write `src/routes/sitemap.xml/+server.ts` (prerendered) that builds
`xhtml:link` alternates from the same data. Use a sitemap index if it is
large.

## Lint

There is no mature raw-text rule for Svelte. Use
`scripts/i18n-scan-hardcoded.mjs src --ext svelte` with a baseline in CI.
The inlang ecosystem also has lint rules for message quality (missing
translations, identical pattern) that complement `i18n-messages.mjs check`.

## Other (Remix / React Router v7)

- Locale segment `($lang)` or `:lang` in routes.
- Load messages in the root `loader` (server). `remix-i18next` or
  `react-i18next` with server-side `i18next` instance per request.
- Render `<html lang dir>` from loader data.
- Emit hreflang via route `meta` / `links` exports from one helper.
- Same rules otherwise.
