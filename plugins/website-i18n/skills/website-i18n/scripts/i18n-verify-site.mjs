#!/usr/bin/env node
// i18n-verify-site.mjs: crawl a sitemap or URL list WITHOUT running JS (the
// way most crawlers see a site) and check the international SEO contract:
// status, lang/dir, self-canonical, hreflang validity + reciprocity + targets,
// HTTP Link header vs head, og:locale, untranslated main content, sitemap vs
// head alternates, and (optionally) forced locale redirects.
// Zero dependencies, Node 18+. Part of the website-i18n skill.

import fs from 'node:fs'
import process from 'node:process'

const HELP = `Usage: node i18n-verify-site.mjs (--sitemap <url> | --urls <file> | --url <url>) [options]

  --sitemap <url>       Sitemap or sitemap index (children are followed)
  --urls <file>         Text file, one absolute URL per line
  --url <url>           Single URL
  --limit <n>           Pages to sample from the sitemap (default 40, spread evenly)
  --max-fetch <n>       Hard cap on HTTP requests incl. alternates (default 400)
  --concurrency <n>     Parallel requests (default 4)
  --ua <bot|browser|string>  User agent for page fetches (default bot = Googlebot)
  --negotiation         Also probe forced redirects (browser UA + foreign Accept-Language)
  --no-reciprocity      Do not fetch hreflang targets
  --similarity <0..1>   Word-set similarity above which a localized page counts as
                        untranslated (default 0.6)
  --report <file.md>    Write a Markdown report
  --json <file>         Write raw results as JSON
  --timeout <ms>        Per-request timeout (default 20000)

Exit code: 1 when any error-level issue is found, else 0.
`

const UA = {
  bot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  browser: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
}

// ISO 639-1
const ISO639_1 = new Set(('aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu').split(' '))
const BAD_REGIONS = new Set(['UK', 'EU', 'UN'])

function parseArgs(argv) {
  const a = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    if (x.startsWith('--')) {
      const k = x.slice(2)
      const n = argv[i + 1]
      if (n === undefined || n.startsWith('--')) a[k] = true
      else { a[k] = n; i++ }
    } else a._.push(x)
  }
  return a
}

// ---------- http ----------

let fetchCount = 0
const cache = new Map()

async function get(url, { ua, headers = {}, timeout, maxFetch, noCache = false }) {
  const key = `${url}|${ua}|${JSON.stringify(headers)}`
  if (!noCache && cache.has(key)) return cache.get(key)
  if (fetchCount >= maxFetch) return { url, status: 0, error: 'max-fetch reached', headers: new Headers(), body: '' }
  fetchCount++
  const p = (async () => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeout)
    try {
      const res = await fetch(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': ua, accept: 'text/html,application/xml;q=0.9,*/*;q=0.8', ...headers } })
      const type = res.headers.get('content-type') || ''
      const body = res.status === 200 && /html|xml/.test(type) ? await res.text() : ''
      return { url, status: res.status, headers: res.headers, body, location: res.headers.get('location') }
    } catch (err) {
      return { url, status: 0, error: err.name === 'AbortError' ? 'timeout' : err.message, headers: new Headers(), body: '' }
    } finally {
      clearTimeout(t)
    }
  })()
  cache.set(key, p)
  return p
}

async function pool(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) }
  }))
  return out
}

// ---------- parsing ----------

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function attrs(tag) {
  const out = {}
  const inner = tag.replace(/^<\s*[\w:-]+/, '').replace(/\/?>$/, '')
  for (const m of inner.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

function parseHtml(html) {
  const headEnd = html.search(/<\/head>/i)
  const head = headEnd > -1 ? html.slice(0, headEnd) : html.slice(0, 200000)
  const bodyPart = headEnd > -1 ? html.slice(headEnd) : ''
  const htmlTag = (html.match(/<html\b[^>]*>/i) || [''])[0]
  const ha = attrs(htmlTag)
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]))
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]))
  const canonicals = links.filter((l) => (l.rel || '').toLowerCase().split(/\s+/).includes('canonical')).map((l) => l.href)
  const alternates = links.filter((l) => (l.rel || '').toLowerCase().split(/\s+/).includes('alternate') && l.hreflang !== undefined)
    .map((l) => ({ code: l.hreflang, href: l.href }))
  const bodyAlternates = [...bodyPart.matchAll(/<link\b[^>]*hreflang[^>]*>/gi)].length
  const meta = (pred) => metas.filter(pred).map((m) => m.content)
  const title = decode(((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim())
  const inLanguage = []
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectInLanguage(JSON.parse(m[1]), inLanguage) } catch { /* ignore invalid JSON-LD here */ }
  }
  const text = bodyPart
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000)
  return {
    lang: ha.lang,
    dir: ha.dir,
    canonicals,
    alternates,
    bodyAlternates,
    robots: meta((m) => /^(robots|googlebot)$/i.test(m.name || '')).join(',').toLowerCase(),
    description: meta((m) => /^description$/i.test(m.name || ''))[0],
    ogLocale: meta((m) => m.property === 'og:locale')[0],
    ogLocaleAlternate: meta((m) => m.property === 'og:locale:alternate'),
    title,
    inLanguage,
    text,
  }
}

function collectInLanguage(node, out) {
  if (Array.isArray(node)) { node.forEach((n) => collectInLanguage(n, out)); return }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'inLanguage' && typeof v === 'string') out.push(v)
      else collectInLanguage(v, out)
    }
  }
}

function parseLinkHeader(value) {
  if (!value) return []
  const out = []
  for (const part of value.split(/,(?=\s*<)/)) {
    const m = part.match(/<([^>]+)>(.*)/)
    if (!m) continue
    const params = Object.fromEntries([...m[2].matchAll(/;\s*([\w-]+)="?([^";]+)"?/g)].map((x) => [x[1].toLowerCase(), x[2]]))
    if ((params.rel || '').split(/\s+/).includes('alternate') && params.hreflang) out.push({ code: params.hreflang, href: m[1] })
  }
  return out
}

function parseSitemap(xml) {
  if (/<sitemapindex\b/i.test(xml)) {
    return { index: true, children: [...xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => decode(m[1])) }
  }
  const urls = []
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = m[1]
    const loc = decode(((block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i) || [])[1] || ''))
    const lastmod = (block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i) || [])[1]
    const alts = [...block.matchAll(/<xhtml:link\b[^>]*>/gi)].map((x) => attrs(x[0])).filter((a) => a.hreflang).map((a) => ({ code: a.hreflang, href: a.href }))
    if (loc) urls.push({ loc, lastmod, alts })
  }
  return { index: false, urls }
}

// ---------- checks ----------

function validCode(code) {
  if (code.toLowerCase() === 'x-default') return null
  if (code.includes('_')) return 'uses "_" (must be "-")'
  const parts = code.split('-')
  if (!ISO639_1.has(parts[0].toLowerCase())) return parts[0].length === 2 ? `"${parts[0]}" is not ISO 639-1` : `"${parts[0]}" must be a 2-letter ISO 639-1 code`
  if (parts.length > 3) return 'too many subtags'
  for (const p of parts.slice(1)) {
    if (/^[A-Za-z]{4}$/.test(p)) continue // script, e.g. Hans
    if (/^[A-Za-z]{2}$/.test(p)) {
      if (BAD_REGIONS.has(p.toUpperCase())) return `region "${p}" is not valid (use GB etc.)`
      continue
    }
    if (/^\d{3}$/.test(p)) return `numeric region "${p}" is not supported by Google (e.g. es-419)`
    return `invalid subtag "${p}"`
  }
  return null
}

function norm(u) {
  try { const x = new URL(u); x.hash = ''; return x.href } catch { return u }
}

function primary(code) {
  return String(code || '').toLowerCase().split(/[-_]/)[0]
}

function wordSet(text) {
  return new Set((text.toLowerCase().match(/[\p{L}]{3,}/gu) || []).slice(0, 4000))
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

function sameAltSet(a, b) {
  const s = (arr) => arr.map((x) => `${x.code.toLowerCase()} ${norm(x.href)}`).sort().join('\n')
  return s(a) === s(b)
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || (!args.sitemap && !args.urls && !args.url)) { console.log(HELP); return args.help ? 0 : 1 }
  const opts = {
    ua: UA[args.ua || 'bot'] || args.ua,
    timeout: Number(args.timeout || 20000),
    maxFetch: Number(args['max-fetch'] || 400),
  }
  const limit = Number(args.limit || 40)
  const concurrency = Number(args.concurrency || 4)
  const simThreshold = Number(args.similarity || 0.6)
  const issues = []
  const add = (level, rule, url, detail = '') => issues.push({ level, rule, url, detail })

  // 1. collect URLs
  let entries = [] // { loc, alts, lastmod }
  const sitemapStats = []
  if (args.sitemap) {
    const queue = [args.sitemap]
    const seen = new Set()
    while (queue.length) {
      const sm = queue.shift()
      if (seen.has(sm)) continue
      seen.add(sm)
      const res = await get(sm, { ...opts, ua: UA.bot })
      if (res.status !== 200) { add('error', 'sitemap unreachable', sm, `status ${res.status} ${res.error || ''}`); continue }
      const parsed = parseSitemap(res.body)
      if (parsed.index) { queue.push(...parsed.children); continue }
      const lastmods = parsed.urls.map((u) => u.lastmod).filter(Boolean)
      const distinct = new Set(lastmods.map((l) => l.slice(0, 16)))
      sitemapStats.push({ sitemap: sm, urls: parsed.urls.length, withAlternates: parsed.urls.filter((u) => u.alts.length).length, lastmods: lastmods.length, distinctLastmod: distinct.size })
      if (parsed.urls.length > 50000) add('error', 'sitemap too large', sm, `${parsed.urls.length} URLs (max 50,000)`)
      if (Buffer.byteLength(res.body) > 50 * 1024 * 1024) add('error', 'sitemap too large', sm, 'over 50 MB')
      if (lastmods.length > 20 && distinct.size === 1) add('warn', 'lastmod not meaningful', sm, `all ${lastmods.length} entries share one lastmod`)
      entries.push(...parsed.urls)
    }
  }
  if (args.urls) entries.push(...fs.readFileSync(args.urls, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#')).map((loc) => ({ loc, alts: [] })))
  if (args.url) entries.push({ loc: args.url, alts: [] })
  const total = entries.length
  // even spread so every sitemap child / locale gets sampled
  if (entries.length > limit) {
    const step = entries.length / limit
    entries = Array.from({ length: limit }, (_, i) => entries[Math.floor(i * step)])
  }
  console.error(`Sampling ${entries.length} of ${total} URL(s)...`)

  // 2. fetch + parse pages
  const pages = await pool(entries, concurrency, async (e) => {
    const res = await get(e.loc, opts)
    const page = { url: e.loc, status: res.status, location: res.location, error: res.error, sitemapAlts: e.alts }
    if (res.status === 200 && res.body) {
      Object.assign(page, parseHtml(res.body))
      page.linkHeaderAlts = parseLinkHeader(res.headers.get('link'))
      page.xRobots = (res.headers.get('x-robots-tag') || '').toLowerCase()
    }
    return page
  })

  // 3. per-page checks
  for (const p of pages) {
    if (p.status !== 200) {
      add('error', 'sitemap URL not 200', p.url, p.status ? `status ${p.status}${p.location ? ` -> ${p.location}` : ''}` : p.error)
      continue
    }
    if (/noindex/.test(p.robots) || /noindex/.test(p.xRobots)) add('error', 'listed URL is noindex', p.url, p.robots || p.xRobots)
    if (!p.title) add('error', 'missing <title>', p.url)
    if (!p.description) add('warn', 'missing meta description', p.url)
    if (!p.lang) add('error', 'missing <html lang>', p.url)
    if (p.canonicals.length === 0) add('error', 'missing canonical', p.url)
    if (p.canonicals.length > 1) add('error', 'multiple canonicals', p.url, p.canonicals.join(' '))
    const canon = p.canonicals[0]
    if (canon) {
      if (!/^https?:\/\//.test(canon)) add('error', 'canonical not absolute', p.url, canon)
      else if (norm(canon) !== norm(p.url)) {
        add('error', 'canonical not self-referencing', p.url, `-> ${canon}${norm(canon).replace(/\/$/, '') === norm(p.url).replace(/\/$/, '') ? ' (trailing slash mismatch)' : ''}`)
      }
    }
    if (p.bodyAlternates) add('error', 'hreflang outside <head>', p.url, `${p.bodyAlternates} tag(s) in body`)
    const alts = p.alternates
    if (!alts.length) {
      if (p.linkHeaderAlts?.length) add('warn', 'hreflang only in HTTP Link header', p.url)
      else add('warn', 'no hreflang', p.url, 'fine for single-locale pages; error if the page has translations')
    }
    const byCode = new Map()
    for (const a of alts) {
      const err = validCode(a.code)
      if (err) add('error', 'invalid hreflang code', p.url, `${a.code}: ${err}`)
      if (!/^https?:\/\//.test(a.href || '')) add('error', 'hreflang href not absolute', p.url, `${a.code} -> ${a.href}`)
      const k = a.code.toLowerCase()
      if (byCode.has(k) && norm(byCode.get(k)) !== norm(a.href)) add('error', 'duplicate hreflang code', p.url, `${a.code}: ${byCode.get(k)} vs ${a.href}`)
      byCode.set(k, a.href)
    }
    if (alts.length) {
      const self = alts.find((a) => norm(a.href) === norm(p.url) && a.code.toLowerCase() !== 'x-default')
      if (!self) add('error', 'hreflang missing self-reference', p.url)
      if (!byCode.has('x-default')) add('warn', 'hreflang missing x-default', p.url)
      if (self && p.lang && primary(self.code) !== primary(p.lang)) add('error', 'lang does not match own hreflang', p.url, `<html lang="${p.lang}"> vs hreflang="${self.code}"`)
      p.selfCode = self?.code
      if (p.linkHeaderAlts?.length) {
        if (!sameAltSet(alts, p.linkHeaderAlts)) add('error', 'HTTP Link header hreflang differs from <head>', p.url, `head ${alts.length} vs header ${p.linkHeaderAlts.length} entries`)
        else add('warn', 'hreflang emitted twice (head + HTTP Link header)', p.url, 'identical now; keep one path so they cannot diverge')
      }
      if (p.sitemapAlts?.length && !sameAltSet(alts, p.sitemapAlts)) {
        add('error', 'sitemap alternates differ from <head>', p.url, `head ${alts.length} vs sitemap ${p.sitemapAlts.length} entries`)
      }
    }
    if (p.ogLocale && !/^[a-z]{2,3}_[A-Z]{2}$/.test(p.ogLocale)) add('warn', 'og:locale format', p.url, `"${p.ogLocale}" should be ll_CC, e.g. fr_FR`)
    if (!p.ogLocale && alts.length > 1) add('warn', 'missing og:locale', p.url)
    if (p.lang && p.inLanguage.length && !p.inLanguage.some((l) => primary(l) === primary(p.lang))) add('warn', 'JSON-LD inLanguage mismatch', p.url, `${p.inLanguage.join(',')} vs lang ${p.lang}`)
    if (['ar', 'he', 'fa', 'ur'].includes(primary(p.lang)) && (p.dir || '').toLowerCase() !== 'rtl') add('error', 'RTL locale without dir="rtl"', p.url)
  }

  // 4. reciprocity + targets + untranslated content
  if (!args['no-reciprocity']) {
    const okPages = pages.filter((p) => p.status === 200 && p.alternates?.length)
    const seenPairs = new Set()
    for (const p of okPages) {
      const targets = p.alternates.filter((a) => a.code.toLowerCase() !== 'x-default' && norm(a.href) !== norm(p.url))
      const results = await pool(targets, concurrency, async (a) => {
        const r = await get(a.href, opts)
        return { a, r, parsed: r.status === 200 && r.body ? parseHtml(r.body) : null }
      })
      for (const { a, r, parsed } of results) {
        if (r.error === 'max-fetch reached') continue
        if (r.status !== 200) { add('error', 'hreflang target not 200', p.url, `${a.code} -> ${a.href} (${r.status || r.error}${r.location ? ` -> ${r.location}` : ''})`); continue }
        if (!parsed) continue
        if (/noindex/.test(parsed.robots)) add('error', 'hreflang target is noindex', p.url, `${a.code} -> ${a.href}`)
        if (parsed.canonicals[0] && norm(parsed.canonicals[0]) !== norm(a.href)) add('error', 'hreflang target not self-canonical', p.url, `${a.code} -> ${a.href} canonical ${parsed.canonicals[0]}`)
        if (!parsed.alternates.some((x) => norm(x.href) === norm(p.url))) add('error', 'missing return link', p.url, `${a.href} does not link back`)
        else if (!sameAltSet(parsed.alternates, p.alternates)) add('warn', 'inconsistent hreflang cluster', p.url, `${a.href} lists a different set`)
        // untranslated: compare target text against this page's text when languages differ
        // untranslated: compare texts when languages differ. Blame the page that is NOT the
        // x-default (source) side, and report each pair once.
        const pairKey = [norm(p.url), norm(a.href)].sort().join(' ')
        if (p.text && parsed.text && primary(a.code) !== primary(p.selfCode || p.lang) && !seenPairs.has(pairKey)) {
          seenPairs.add(pairKey)
          const xDefault = norm(p.alternates.find((x) => x.code.toLowerCase() === 'x-default')?.href || '')
          const [suspect, other] = norm(a.href) === xDefault ? [p.url, a.href] : [a.href, p.url]
          const sim = jaccard(wordSet(p.text), wordSet(parsed.text))
          if (sim >= simThreshold) add('error', 'main content looks untranslated', suspect, `${Math.round(sim * 100)}% word overlap with ${other}`)
          if (parsed.title && parsed.title === p.title) add('warn', 'identical <title> across languages', suspect, parsed.title)
        }
      }
    }
  }

  // 5. forced redirect probes
  if (args.negotiation) {
    const probe = pages.filter((p) => p.status === 200).slice(0, 15)
    for (const p of probe) {
      const other = (p.alternates || []).map((a) => a.code).find((c) => c.toLowerCase() !== 'x-default' && primary(c) !== primary(p.lang)) || 'de'
      const r = await get(p.url, { ...opts, ua: UA.browser, headers: { 'accept-language': `${other},${primary(other)};q=0.9` }, noCache: true })
      const isRoot = new URL(p.url).pathname === '/'
      if (r.status >= 300 && r.status < 400) {
        if (isRoot) {
          if (!/accept-language|cookie/i.test(r.headers.get('vary') || '')) add('warn', 'root negotiates without Vary', p.url, `-> ${r.location}`)
        } else add('error', 'forced locale redirect', p.url, `Accept-Language ${other} -> ${r.status} ${r.location}`)
      }
    }
  }

  // 6. report
  const errors = issues.filter((i) => i.level === 'error')
  const warns = issues.filter((i) => i.level === 'warn')
  const byRule = {}
  for (const i of issues) (byRule[`${i.level}|${i.rule}`] ||= []).push(i)
  const lines = []
  lines.push('# i18n verify report', '')
  lines.push(`- Source: ${args.sitemap || args.urls || args.url}`)
  lines.push(`- Sampled pages: ${pages.length} of ${total} | HTTP requests: ${fetchCount} | UA: ${args.ua || 'bot'}`)
  lines.push(`- **${errors.length} error(s), ${warns.length} warning(s)**`, '')
  if (sitemapStats.length) {
    lines.push('## Sitemaps', '', '| Sitemap | URLs | With alternates | lastmod | Distinct lastmod |', '|---|---|---|---|---|')
    for (const s of sitemapStats) lines.push(`| ${s.sitemap} | ${s.urls} | ${s.withAlternates} | ${s.lastmods} | ${s.distinctLastmod} |`)
    lines.push('')
  }
  lines.push('## Issues by rule', '', '| Level | Rule | Count | Example |', '|---|---|---|---|')
  for (const [k, list] of Object.entries(byRule).sort()) {
    const [level, rule] = k.split('|')
    lines.push(`| ${level} | ${rule} | ${list.length} | ${list[0].url} ${list[0].detail ? `(${list[0].detail.replace(/\|/g, '/')})` : ''} |`)
  }
  lines.push('', '## All issues', '')
  for (const i of issues) lines.push(`- **${i.level}** ${i.rule}: ${i.url}${i.detail ? ` - ${i.detail}` : ''}`)
  lines.push('', '## Pages', '', '| URL | Status | lang | canonical self | hreflang | og:locale |', '|---|---|---|---|---|---|')
  for (const p of pages) lines.push(`| ${p.url} | ${p.status} | ${p.lang || ''} | ${p.canonicals ? (p.canonicals[0] && norm(p.canonicals[0]) === norm(p.url) ? 'yes' : 'NO') : ''} | ${p.alternates ? p.alternates.length : ''} | ${p.ogLocale || ''} |`)
  const md = lines.join('\n') + '\n'
  if (args.report) fs.writeFileSync(args.report, md)
  if (args.json) fs.writeFileSync(args.json, JSON.stringify({ issues, sitemapStats, pages: pages.map(({ text, ...rest }) => rest) }, null, 2))
  // console summary
  console.log(`${errors.length} error(s), ${warns.length} warning(s) over ${pages.length} sampled page(s), ${fetchCount} request(s).`)
  for (const [k, list] of Object.entries(byRule).sort()) {
    const [level, rule] = k.split('|')
    console.log(`  ${level.padEnd(5)} ${rule} (${list.length})  e.g. ${list[0].url}${list[0].detail ? `  ${list[0].detail}` : ''}`)
  }
  if (args.report) console.log(`Report: ${args.report}`)
  return errors.length ? 1 : 0
}

main().then((code) => { process.exitCode = code }, (err) => { console.error(`i18n-verify-site: ${err.stack || err.message}`); process.exitCode = 1 })
