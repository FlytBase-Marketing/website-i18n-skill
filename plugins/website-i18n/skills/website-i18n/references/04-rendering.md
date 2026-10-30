# 04: Rendering (SSR, SSG, ISR) and request handling

Translated content must be in the HTML response.

- **Google** renders JS in a deferred queue, and only for pages that return
  200.
- **Most AI crawlers do not execute JS** (GPTBot, ClaudeBot, PerplexityBot,
  per Vercel's Dec 2024 crawl study).
- **Social unfurlers do not execute JS** (LinkedIn, Slack, X).

Client-side translation widgets and SPA i18n that loads messages after
hydration are invisible to all of them.

## Rendering mode per page type

| Page type | Mode | Notes |
|---|---|---|
| Home, product, pricing, industry, about (code plus messages) | **SSG** for every locale | Static params = locales. They exist in every locale by definition |
| Legal | SSG | Often single-locale by policy. If so, document it and 404 the other locales, or serve with a clear "English only" notice, noindex and a canonical to the source |
| Blog post, case study, CMS landing page | **SSG or ISR from the real variants** | Static params = (locale, slug) pairs that exist. Long revalidate plus on-demand revalidation from a CMS webhook. Unknown slug: 404 |
| Blog index, category, tag, author | ISR | Lists only items available in the locale. Paginated pages self-canonical |
| Search results | SSR or client-side, `noindex` | Never indexed. Still localized chrome |
| Forms and thank-you | SSG plus client form | Submit the locale with the payload. `noindex` the thank-you page |
| 404 | Static per locale | Must return status 404. Keep it free of request-dependent calls if your framework would turn it dynamic and 500 |
| Campaign page in the source language only | SSG for the source only | Other locales 404, no hreflang, not in the sitemap |
| Personalized or gated | SSR | Rare on marketing sites. Cache carefully (see Vary) |

### Static params: avoid the cross-join

When a parent layout emits every locale and a child `[slug]` route emits bare
`{ slug }`, some frameworks prerender locales x slugs. The reference project
hit 7,627 pages and a failed deploy that way.

- Child routes return explicit `{ locale, slug }` pairs **only for variants
  that exist.**
- Or prebuild the source locale only and let ISR render the rest on demand.
- Add an audit (a grep or AST check) that fails CI if a detail route returns
  params without a locale.

### Revalidation

- On publish, revalidate **every locale variant's path,** plus the listing
  pages and the sitemap child that contain it.
- Referenced entities (author, category) change many pages. Use tag-based
  revalidation.
- Keep a long time-based revalidate as a safety net only, so crawler bursts on
  cold URLs do not hammer the CMS.

## Request pipeline (middleware, proxy, hooks)

Order matters. First match wins.

1. **Reject garbage paths.** Malformed percent-encoding, or (if your stack
   writes paths into headers) non-Latin-1 characters, get a 404. The
   reference project saw 500s from crawler-invented
   `/ko/industries/사례 연구` URLs.
2. **Canonicalize** for everyone, bots included: `/en/x` to `/x` (as-needed),
   and the trailing-slash form. Use 301/308.
3. **An explicit locale prefix** wins. Serve it. Never redirect it elsewhere.
4. **Bots stop here.** Serve the requested URL with no negotiation.
5. **Optional negotiation, `x-default` root only:** cookie, then
   `Accept-Language`, then (discouraged) geo-IP. Use 302/307 and
   `Vary: Accept-Language, Cookie`.
6. **Default:** serve the source locale.

Keep the bot list in one module. Treat it as defense in depth, not as
permission to negotiate deep URLs for humans.

## The curl matrix (run in Phase 1 and Phase 7)

```bash
BASE=https://site.com   # or http://localhost:3000 after build && start
P=/pricing              # repeat for a CMS detail page, e.g. /blog/<slug>
UA_BOT='Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

# 1. Localized content is in the server HTML (no JS)
curl -s "$BASE/fr$P" | grep -o '<html[^>]*>'                  # lang="fr"
curl -s "$BASE/fr$P" | grep -c '<expected French phrase>'      # > 0
curl -s "$BASE/fr$P" | grep -o '<title>[^<]*</title>'          # French title

# 2. Bots and clean clients are not redirected
curl -s -o /dev/null -w '%{http_code}\n' -A "$UA_BOT" "$BASE$P"                         # 200
curl -s -o /dev/null -w '%{http_code}\n' -A "$UA_BOT" "$BASE/fr$P"                      # 200
curl -s -o /dev/null -w '%{http_code}\n' -H 'Accept-Language: de' "$BASE/fr$P"          # 200, never 3xx

# 3. Canonicalization
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$BASE/en$P"   # 308/301 -> $BASE$P (as-needed)
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$BASE$P/"     # per trailing-slash policy

# 4. Errors
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/xx$P"                   # 404
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/fr/does-not-exist"      # 404
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/ko/%EC%82%AC%EB%A1%80"  # 404, not 500

# 5. Head signals
curl -s "$BASE/fr$P" | grep -oE '<link[^>]+rel="(canonical|alternate)"[^>]*>'
curl -s "$BASE/fr$P" | grep -oE '<meta[^>]+og:locale[^>]*>'

# 6. Root negotiation (only if enabled)
curl -sI -H 'Accept-Language: fr' "$BASE/" | grep -iE '^(location|vary):'
```

The verify script automates 1 to 5 across a sitemap sample.

## Caching

- Localized URLs return the same bytes for everyone, so they are fully
  cacheable.
- Any response that depends on `Accept-Language`, a cookie or geo must send
  `Vary`, or be uncacheable. Otherwise the CDN serves German to everyone.
  Keep negotiation on `/` only.
- With ISR, a revalidation must cover all locale variants. A stale `/fr/x`
  after an English edit is expected only until the fan-out finishes.

## Hydration and formatting

- Format dates and numbers on the server with an explicit locale **and
  timezone.** Client and server defaults differ and cause hydration
  mismatches.
- Pass only the needed message namespaces to client components. Shipping the
  full catalog for 10 locales bloats JS.
- Render the language switcher as plain `<a href>` links in the server HTML.
  A client-side `router.replace` alone is not crawlable.
