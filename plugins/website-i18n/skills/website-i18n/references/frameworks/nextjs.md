# Next.js (App Router) with next-intl

This is the reference implementation: Next.js 16 + next-intl v4 + Sanity,
with 9 locales in production. Check the installed versions first. Next.js 16
renamed `middleware.ts` to `proxy.ts` (`middleware.ts` still works with a
deprecation warning), and APIs move between majors. Read
`node_modules/next/dist/docs/` and the next-intl docs for the installed
version before coding.

## File layout

```
src/
  i18n/
    config.ts        # locales, defaultLocale, rtlLocales, labels (native), code maps (lang/hreflang/og)
    routing.ts       # defineRouting({...}): single source for proxy + navigation
    navigation.ts    # createNavigation(routing): Link, redirect, usePathname, useRouter, getPathname
    request.ts       # getRequestConfig: load messages/{locale}.json, fallback to source
  messages/{locale}.json
  proxy.ts           # (or middleware.ts) canonicalize, then bot bypass, then explicit prefix, then optional root negotiation
  app/
    [locale]/
      layout.tsx     # <html lang dir>, setRequestLocale, NextIntlClientProvider, generateStaticParams(locales)
      not-found.tsx  # static, no request-dependent calls
      page.tsx ...   # every page: generateMetadata with alternates from buildAlternates
    sitemap.xml/route.ts  + sitemap/[id]/route.ts   # index + children (or app/sitemap.ts + generateSitemaps)
    robots.ts
  lib/seo/
    alternates.ts    # urlFor + buildAlternates(path, locale, available?): the ONLY hreflang/canonical source
```

## routing.ts

```ts
import { defineRouting } from 'next-intl/routing'
import { defaultLocale, locales } from './config'

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',   // or 'always'
  localeDetection: false,      // URL decides; enable only for root negotiation you control
  alternateLinks: false,       // metadata API is the single hreflang path; the default `true`
                               // also emits an HTTP Link header that is NOT availability-aware
  // pathnames: { '/about': { en: '/about', de: '/ueber-uns' } }  // only with localized static paths
})
```

`localeDetection: false` makes next-intl serve exactly the URL requested. If
you want root-only negotiation, implement it yourself in the proxy for
`pathname === '/'`, for humans only, with `Vary`.

## Root layout

```tsx
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))   // the ONE place every locale is emitted
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)                       // enables static rendering
  const messages = await getMessages()
  return (
    <html lang={langTag[locale]} dir={rtlLocales.includes(locale) ? 'rtl' : 'ltr'}>
      <body>
        <NextIntlClientProvider messages={pick(messages, clientNamespaces)}>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
```

- Call `setRequestLocale(locale)` in every page and layout that renders
  statically, before calling `getTranslations`.
- Pass the client provider only the namespaces client components need.

## Metadata (every indexable page)

```ts
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'pricing.meta' })
  const alternates = buildAlternates('/pricing', locale)   // static page: all locales
  return {
    title: t('title'),                 // root layout template adds "| Brand" once
    description: t('description'),
    alternates,
    openGraph: { url: alternates.canonical, locale: ogLocale[locale], alternateLocale: otherOgLocales(locale), type: 'website' },
  }
}
```

**CMS detail page:** fetch the document with its translation cluster and call
`buildAlternates(`/blog/${slug}`, locale, translationsToAlternates(doc.translations, (s) => `/blog/${s}`))`.

**Never render `<link rel="alternate">` from a component.** Next emits
`alternates.languages` as `<link rel="alternate" hrefLang=...>`. Lowercase or
camelCase does not matter to crawlers.

Fetch CMS data for metadata, JSON-LD, sitemap and OG **without**
visual-editing markers (`stega: false` with next-sanity), and clean any value
you compare.

## Navigation

- Import `Link`, `redirect`, `usePathname` and `useRouter` **only** from
  `@/i18n/navigation`. Lint-ban `next/link` and the `next/navigation` router
  hooks in locale-aware code.
- `<Link href="/pricing">` renders `/pricing` or `/fr/pricing` automatically.
- Language switcher: server-render `<a href={getPathname({ href, locale: l })}>`
  for each available locale. Hide locales not in `available` on CMS pages.

## Static pages vs CMS pages

| Kind | Static params | Alternates | Sitemap |
|---|---|---|---|
| Code plus messages page | Inherit `[locale]` from the layout | `buildAlternates(path, locale)` | Every locale |
| CMS detail `[slug]` | `{ locale, slug }` pairs **from the CMS variants** (never bare `{ slug }`) | With `available` from the translation cluster | Only the existing variants, with their own slugs |
| Source-only page | `[{ locale: defaultLocale }]` plus `notFound()` for the other locales | None (or self only), noindex if needed | Source only |

- `export const revalidate = <long>` plus on-demand `revalidatePath` or
  `revalidateTag` from a webhook.
- Add `scripts/audit-static-params` to CI. It fails when a `[slug]` route
  returns params without `locale`.

## Proxy / middleware order

```ts
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  // 0. 404 malformed / non-latin-1 paths (Next writes paths into cache-tag headers)
  // 1. canonicalize /en/* -> /* (308) for everyone; set NEXT_LOCALE=en
  // 2. bots: serve as requested (rewrite unprefixed -> /en/... internally), never negotiate
  // 3. explicit non-default prefix -> intlMiddleware(req)
  // 4. (optional) pathname === '/' && cookie/Accept-Language -> 307 + Vary
  // 5. intlMiddleware(req)
}
export const config = { matcher: ['/((?!api|studio|_next|sitemap/|.*\\..*).*)'] }
```

Exclude `/api`, the CMS studio, `_next`, sitemap children, files with
extensions, and any reverse-proxied sub-apps from the matcher.

## Sitemap

- `app/sitemap.ts` supports `alternates.languages`, and `generateSitemaps`
  splits into children, but it does not emit a sitemap index. For an index,
  use route handlers (`app/sitemap.xml/route.ts` plus `app/sitemap/[id]/route.ts`)
  that serialize with `xmlns:xhtml`.
- Build entries from the **same** availability data as page alternates.
- Use real `lastmod` per entry (CMS `_updatedAt` of that locale's variant).
  The index `lastmod` is the max of its children's entries, not `new Date()`.

## Lint gate

```js
// eslint.config.mjs
{ files: ['src/**/*.{tsx,jsx}'], rules: { 'react/jsx-no-literals': ['warn', { noStrings: true, ignoreProps: true, allowedStrings: ['Brand', '/', '+', '-', '·'] }] } }
```

In CI, lint only the changed `.tsx`/`.jsx` files and fail on that rule (see
`templates/github-workflow-i18n.yml`).

## 404 pitfall (Next 16)

`not-found.tsx` under an SSG/ISR route must not call request-dependent APIs
(`getLocale()`, `headers()`, `cookies()`). Doing so flips the render to
dynamic at runtime and returns a **500** instead of a 404. Use static
`metadata`, and get localized copy from the client provider or a static
import.

## Pages Router (legacy)

Use `next.config.js` `i18n: { locales, defaultLocale, localeDetection: false }`
(not supported in the App Router). Then:

- `getStaticProps({ locale })` loads the messages
- `getStaticPaths` returns `{ params, locale }` per existing variant
- `next/head` renders hreflang from one helper

The same rules apply.
