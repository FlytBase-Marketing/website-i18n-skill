#!/usr/bin/env node
// i18n-messages.mjs: deterministic plumbing for UI message files.
// Zero dependencies, Node 18+. Part of the website-i18n skill.
//
//   stats   size + rough token estimate per locale
//   check   validate every locale file against the source (CI gate)
//   prep    write translation jobs (missing + stale + untranslated) to <state>/jobs
//   apply   validate translator output in <state>/out and merge into locale files
//   validate  validate one job/out pair without merging (for CMS adapters)
//   adopt   record source hashes for existing translations (staleness baseline)
//   pseudo  write a pseudo-locale file for layout testing
//   suggest-glossary  find brand/product names that must never be translated
//
// Run with --help for options.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const HELP = `Usage: node i18n-messages.mjs <command> [options]

Commands:
  stats                 Source size and per-locale work estimate
  check                 Validate locale files against the source (exit 1 on errors)
  prep                  Write translation jobs for missing/stale/untranslated keys
  apply                 Validate translator outputs and merge into locale files
  validate              Validate --job <file> --out <file> without merging
  adopt                 Record source hashes for all existing translations
  pseudo                Write a pseudo-locale (default en-XA) for layout QA
  suggest-glossary      List brand/product/acronym candidates for the do-not-translate list
                        (--min <n> occurrences, default 2; --top <n>; --json)

Options:
  --config <file>       i18n.config.json (default: ./i18n.config.json if present)
  --pattern <glob>      Message file pattern, e.g. "src/messages/{locale}.json"
                        or "locales/{locale}/*.json" (overrides config)
  --dir <dir>           Shortcut for --pattern "<dir>/{locale}.json"
  --source <code>       Source locale (default: config.sourceLocale or "en")
  --locales a,b,c       Restrict to these target locales
  --glossary <file>     Glossary JSON (overrides config)
  --state <dir>         State dir for jobs/out/rejects/hashes (default .i18n)
  --batch <n>           Max items per job (default 80)
  --batch-chars <n>     Max source chars per job (default 12000)
  --longform <n>        Strings longer than this go to "balanced" tier jobs (default 400)
  --dry-run             Report only, write nothing
  --prune               (apply) drop keys that no longer exist in the source
  --json                (check/stats) machine-readable output
  --max-list <n>        (check) max issues listed per locale and rule (default 20)
  --warnings            (check) list warning items too (default: counts only)
  --job <file> --out <file>   (validate)
  --pseudo-locale <code>      (pseudo) default en-XA
`

// ---------- args / config ----------

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) args[key] = true
      else { args[key] = next; i++ }
    } else args._.push(a)
  }
  return args
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback
    throw new Error(`Cannot read JSON ${file}: ${err.message}`)
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}

function loadSettings(args) {
  const configPath = args.config || (fs.existsSync('i18n.config.json') ? 'i18n.config.json' : null)
  const config = configPath ? readJson(configPath) : {}
  const sourceLocale = args.source || config.sourceLocale || 'en'
  let pattern = args.pattern || (args.dir ? path.join(args.dir, '{locale}.json') : null) || config.messages?.pattern
  if (!pattern) throw new Error('No message pattern. Pass --config, --pattern or --dir.')
  const configLocales = (config.locales || []).map((l) => (typeof l === 'string' ? l : l.code))
  const localeMeta = Object.fromEntries((config.locales || []).filter((l) => typeof l === 'object').map((l) => [l.code, l]))
  let targets = configLocales.filter((l) => l !== sourceLocale)
  if (targets.length === 0) targets = discoverLocales(pattern).filter((l) => l !== sourceLocale)
  if (args.locales) {
    const only = String(args.locales).split(',').map((s) => s.trim()).filter(Boolean)
    targets = targets.filter((l) => only.includes(l))
    for (const l of only) if (!targets.includes(l) && l !== sourceLocale) targets.push(l)
  }
  const glossaryPath = args.glossary || config.glossary
  const glossary = glossaryPath ? readJson(glossaryPath, {}) : {}
  const t = config.translation || {}
  return {
    config,
    sourceLocale,
    pattern,
    targets,
    localeMeta,
    glossary: {
      // entries: "FlytBase" or { "term": "FlytBase", "allow": { "ja": ["フライトベース"] }, "note": "..." }
      doNotTranslate: (glossary.doNotTranslate || []).map((e) => (typeof e === 'string' ? { term: e, allow: {} } : { term: e.term, allow: e.allow || {}, note: e.note })).filter((e) => e.term),
      terms: glossary.terms || {},
      style: glossary.style || {},
    },
    stateDir: args.state || config.stateDir || '.i18n',
    batch: Number(args.batch || t.batchSize || 80),
    batchChars: Number(args['batch-chars'] || t.maxBatchChars || 12000),
    longform: Number(args.longform || t.longformThreshold || 400),
    maxLengthRatio: Number(t.maxLengthRatio || 3),
    replace: t.replace || {},
    allowIdentical: new Set(t.allowIdentical || []),
    skipKeys: new RegExp(config.messages?.skipKeysMatching || '^_'),
    contextFile: config.messages?.context,
    dryRun: Boolean(args['dry-run']),
  }
}

// ---------- files ----------

function patternFor(pattern, locale) {
  return pattern.split('{locale}').join(locale)
}

function expandFiles(pattern, locale) {
  const p = patternFor(pattern, locale)
  if (!p.includes('*')) return [p]
  const dir = path.dirname(p)
  const base = path.basename(p)
  if (dir.includes('*')) throw new Error('Only a "*" in the file name is supported, not in directories')
  const re = new RegExp('^' + base.split('*').map(escapeRe).join('.*') + '$')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f))
}

function discoverLocales(pattern) {
  const [before] = pattern.split('{locale}')
  const dir = before.endsWith('/') || before === '' ? before || '.' : path.dirname(before + 'x')
  if (!fs.existsSync(dir)) return []
  const rest = pattern.slice(pattern.indexOf('{locale}') + '{locale}'.length)
  return fs.readdirSync(dir)
    .map((name) => {
      if (rest.startsWith('/')) return fs.statSync(path.join(dir, name)).isDirectory() ? name : null
      return name.endsWith(rest) ? name.slice(0, -rest.length) : null
    })
    .filter((l) => l && /^[a-z]{2,3}([-_][A-Za-z0-9]+)*$/.test(l))
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Load all files for a locale into one flat map. With several files, keys
// are prefixed "<file-basename>::" so the namespaces never collide.
function loadLocale(settings, locale) {
  const sourceFiles = expandFiles(settings.pattern, settings.sourceLocale)
  const multi = sourceFiles.length > 1 || settings.pattern.includes('*')
  const flat = new Map()
  const trees = {}
  for (const sf of sourceFiles) {
    const rel = path.basename(sf)
    const localized = patternFor(settings.pattern, locale)
    const file = localized.includes('*') ? path.join(path.dirname(localized), rel) : localized
    const tree = readJson(file, null)
    trees[file] = { tree, ns: multi ? rel.replace(/\.json$/, '') + '::' : '', sourceFile: sf }
    if (tree) flatten(tree, trees[file].ns, flat)
  }
  return { flat, files: trees }
}

function flatten(node, prefix, out) {
  if (typeof node === 'string') {
    out.set(prefix, node)
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => flatten(v, joinKey(prefix, String(i)), out))
    return out
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) flatten(v, joinKey(prefix, k), out)
  }
  return out
}

function joinKey(prefix, k) {
  if (!prefix) return k
  if (prefix.endsWith('::')) return prefix + k
  return `${prefix}.${k}`
}

// Rebuild a target tree in source key order. Missing translations are
// omitted (the i18n library falls back to source), except inside arrays,
// where the source value is kept so indices stay aligned.
function rebuild(sourceNode, prefix, targetFlat, inArray = false) {
  if (typeof sourceNode === 'string') {
    const v = targetFlat.get(prefix)
    if (typeof v === 'string' && v !== '') return v
    return inArray ? sourceNode : undefined
  }
  if (Array.isArray(sourceNode)) {
    return sourceNode.map((v, i) => rebuild(v, joinKey(prefix, String(i)), targetFlat, true))
  }
  if (sourceNode && typeof sourceNode === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(sourceNode)) {
      const r = rebuild(v, joinKey(prefix, k), targetFlat, false)
      if (r !== undefined && !(typeof r === 'object' && !Array.isArray(r) && Object.keys(r).length === 0)) out[k] = r
    }
    return out
  }
  return sourceNode // numbers, booleans, null: copied
}

function setPath(tree, segments, value) {
  let cur = tree
  for (let i = 0; i < segments.length - 1; i++) {
    const s = segments[i]
    if (cur[s] === undefined) cur[s] = {}
    if (typeof cur[s] !== 'object' || cur[s] === null) return false
    cur = cur[s]
  }
  if (typeof cur !== 'object' || cur === null) return false
  cur[segments[segments.length - 1]] = value
  return true
}

function writeLocale(settings, locale, targetFlat, { prune }) {
  const src = loadLocale(settings, settings.sourceLocale)
  const tgt = loadLocale(settings, locale)
  const written = []
  for (const [file, info] of Object.entries(tgt.files)) {
    const sourceTree = src.files[info.sourceFile]?.tree ?? readJson(info.sourceFile)
    const tree = rebuild(sourceTree, info.ns, targetFlat) || {}
    if (!prune && info.tree) {
      // keep orphan keys (exist in target, not in source) at the end
      const srcFlat = flatten(sourceTree, info.ns, new Map())
      for (const [k, v] of flatten(info.tree, info.ns, new Map())) {
        if (srcFlat.has(k)) continue
        const rel = info.ns ? k.slice(info.ns.length) : k
        setPath(tree, rel.split('.'), v)
      }
    }
    if (!settings.dryRun) writeJson(file, tree)
    written.push(file)
  }
  return written
}

// ---------- message analysis ----------

const NON_LATIN = new Set(['ja', 'zh', 'ko', 'ru', 'uk', 'bg', 'sr', 'mk', 'be', 'kk', 'ar', 'he', 'fa', 'ur', 'el', 'th', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ka', 'hy', 'am', 'km', 'lo', 'my', 'si', 'ne', 'mn'])
const CJK = new Set(['ja', 'zh', 'ko'])
const LETTER = /\p{L}/u

function baseLang(locale) {
  return String(locale).toLowerCase().split(/[-_]/)[0]
}

// Minimal ICU MessageFormat walker. Returns argument names, plural/select
// structures and whether the braces balance. Apostrophe escaping is honoured
// for '{' and '}' only.
function analyzeIcu(msg) {
  const args = new Set()
  const selects = [] // { name, type, keys: Set }
  let ok = true
  let i = 0

  function skipWs() { while (i < msg.length && /\s/.test(msg[i])) i++ }

  function parseMessage(depth) {
    while (i < msg.length) {
      const c = msg[i]
      if (c === "'" && (msg[i + 1] === '{' || msg[i + 1] === '}')) {
        const end = msg.indexOf("'", i + 1)
        i = end === -1 ? msg.length : end + 1
        continue
      }
      if (c === '{') { i++; parseArgument(depth); continue }
      if (c === '}') { if (depth === 0) ok = false; return }
      i++
    }
    if (depth > 0) ok = false
  }

  function parseArgument(depth) {
    skipWs()
    const m = /^[^\s,{}]+/.exec(msg.slice(i))
    if (!m) { // not an argument (e.g. stray brace): consume to matching brace
      let d = 1
      while (i < msg.length && d > 0) { if (msg[i] === '{') d++; else if (msg[i] === '}') d--; i++ }
      if (d !== 0) ok = false
      return
    }
    const name = m[0]
    i += name.length
    skipWs()
    if (msg[i] === '}') { args.add(name); i++; return }
    if (msg[i] !== ',') { // "{No results}" style text inside braces: treat as literal block
      let d = 1
      while (i < msg.length && d > 0) { if (msg[i] === '{') d++; else if (msg[i] === '}') d--; i++ }
      if (d !== 0) ok = false
      return
    }
    i++
    skipWs()
    const t = /^\w+/.exec(msg.slice(i))
    const type = t ? t[0] : ''
    i += type.length
    skipWs()
    args.add(name)
    if (msg[i] === '}') { i++; return } // {n, number}
    if (msg[i] !== ',') { ok = false; return }
    i++
    if (['plural', 'select', 'selectordinal'].includes(type)) {
      const keys = new Set()
      while (i < msg.length) {
        skipWs()
        if (msg[i] === '}') { i++; break }
        const sel = /^(offset:\d+|=?[^\s{}]+)/.exec(msg.slice(i))
        if (!sel) { ok = false; return }
        i += sel[0].length
        skipWs()
        if (sel[0].startsWith('offset:')) continue
        keys.add(sel[0])
        if (msg[i] !== '{') { ok = false; return }
        i++
        parseMessage(depth + 1)
        if (msg[i] === '}') i++
        else { ok = false; return }
      }
      selects.push({ name, type, keys })
    } else {
      // {d, date, short} style: consume to closing brace
      let d = 1
      while (i < msg.length && d > 0) { if (msg[i] === '{') d++; else if (msg[i] === '}') d--; i++ }
      if (d !== 0) ok = false
    }
  }

  parseMessage(0)
  return { args, selects, ok }
}

function multiset(arr) {
  const m = new Map()
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1)
  return m
}

function sameMultiset(a, b) {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

function tokens(str) {
  const tags = [...str.matchAll(/<\/?([A-Za-z0-9_-]+)(?:\s[^<>]*)?\/?>/g)].map((m) => m[0].replace(/\s.*?(\/?)>$/, '$1>').replace(/\s+/g, ''))
  const urls = [...str.matchAll(/https?:\/\/[^\s)"'<>\]\u0080-\uFFFF]+/g)].map((m) => m[0].replace(/[.,;:!?]+$/, ''))
  const mdLinks = [...str.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])
  const tmpl = [...str.matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0].replace(/\s+/g, ''))
  const printf = [...str.matchAll(/%(\d+\$)?[sdif@]/g)].map((m) => m[0])
  const linked = [...str.matchAll(/@:[\w.]+/g)].map((m) => m[0])
  return { tags, urls, mdLinks, tmpl, printf, linked }
}

function countTerm(str, term) {
  if (!term) return 0
  return str.split(term).length - 1
}

function hasRepeatedTerm(str, term) {
  return new RegExp(`${escapeRe(term)}[\\s\\u3000]*${escapeRe(term)}`, 'u').test(str)
}

// Human-visible text of an ICU message (drops argument syntax and selectors).
function visibleText(msg) {
  return msg
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\{\s*[^\s,{}]+\s*,\s*(plural|select|selectordinal)\s*,/g, ' ')
    .replace(/(=\d+|zero|one|two|few|many|other|[\w-]+)\s*\{/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/[{}#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CONNECTORS = new Set(['vs', 'vs.', 'v.', 'x', '&', '/', '-', '+', '|', 'of'])

function hashSource(s) {
  return createHash('sha1').update(s).digest('hex').slice(0, 12)
}

// Returns { errors: string[], warnings: string[] }
function validatePair({ key, source, translation, locale, settings, reason }) {
  const errors = []
  const warnings = []
  if (typeof translation !== 'string' || translation.trim() === '') {
    errors.push('empty: no translation')
    return { errors, warnings }
  }
  if (translation === key) errors.push('raw key: key rendered as value')

  // identical to source
  if (translation === source && LETTER.test(visibleText(source))) {
    const visible = visibleText(source)
    const stripped = settings.glossary.doNotTranslate.reduce((s, t) => s.split(t.term).join(''), visible)
    const onlyProtected = !LETTER.test(stripped)
    // "DJI Dock 2", "FlytBase vs. FlightHub 2": every word capitalised, numeric or a connector
    const properNoun = visible.split(/\s+/).every((w) => /^[\p{Lu}\p{N}]/u.test(w) || !LETTER.test(w) || CONNECTORS.has(w.toLowerCase()))
    // reason "untranslated": the translator already confirmed the identical value once
    if (!onlyProtected && !settings.allowIdentical.has(source) && reason !== 'untranslated') {
      if (!properNoun && (NON_LATIN.has(baseLang(locale)) || visible.length > 20)) errors.push('identical to source: untranslated')
      else warnings.push('identical to source: short string, check')
    }
  }

  // ICU
  const s = analyzeIcu(source)
  const t = analyzeIcu(translation)
  if (s.ok && !t.ok) errors.push('ICU syntax: braces unbalanced')
  if (s.ok && t.ok) {
    const missing = [...s.args].filter((a) => !t.args.has(a))
    const extra = [...t.args].filter((a) => !s.args.has(a))
    if (missing.length) errors.push(`placeholders: missing ${missing.map((a) => `{${a}}`).join(', ')}`)
    if (extra.length) errors.push(`placeholders: added ${extra.map((a) => `{${a}}`).join(', ')}`)
    for (const sel of s.selects) {
      const match = t.selects.find((x) => x.name === sel.name)
      if (!match) { errors.push(`ICU ${sel.type}: structure lost for {${sel.name}}`); continue }
      if (!match.keys.has('other')) errors.push(`ICU ${sel.type}: {${sel.name}} has no "other" branch`)
      if (sel.type === 'select') {
        const lost = [...sel.keys].filter((k) => !match.keys.has(k))
        if (lost.length) errors.push(`ICU select: {${sel.name}} lost options ${lost.join(', ')}`)
      }
    }
  }

  // tags, urls, links, template placeholders
  const st = tokens(source)
  const tt = tokens(translation)
  for (const [name, label] of [['tags', 'tag set'], ['urls', 'URL set'], ['mdLinks', 'link targets'], ['tmpl', 'template placeholders'], ['printf', 'printf placeholders'], ['linked', 'linked messages']]) {
    if (!sameMultiset(multiset(st[name]), multiset(tt[name]))) {
      errors.push(`${label}: source [${st[name].join(' ')}] vs [${tt[name].join(' ')}]`)
    }
  }

  // glossary: do-not-translate
  for (const { term, allow } of settings.glossary.doNotTranslate) {
    // a brand may appear as written, or in a native-script form the glossary approves for this locale
    const forms = [term, ...(allow[locale] || allow[baseLang(locale)] || [])]
    const n = countTerm(source, term)
    if (n > 0 && forms.every((f) => countTerm(translation, f) === 0)) {
      errors.push(`glossary: do-not-translate term "${term}" missing (translated, transliterated or dropped)`)
    }
    for (const f of forms) {
      if (hasRepeatedTerm(translation, f) && !hasRepeatedTerm(source, term)) errors.push(`glossary: term repeated "${f} ${f}"`)
    }
  }
  // glossary: forced terms per locale
  const forced = settings.glossary.terms[locale] || settings.glossary.terms[baseLang(locale)] || {}
  for (const [srcTerm, tgtTerm] of Object.entries(forced)) {
    if (new RegExp(`(^|[^\\p{L}])${escapeRe(srcTerm)}([^\\p{L}]|$)`, 'iu').test(source)
      && !translation.toLowerCase().includes(String(tgtTerm).toLowerCase())) {
      errors.push(`glossary: "${srcTerm}" should be "${tgtTerm}"`)
    }
  }

  // length ratio
  if (source.length >= 8) {
    const ratio = translation.length / source.length
    const min = CJK.has(baseLang(locale)) ? 0.1 : 0.25
    if (source.length >= 40 && ratio < min) errors.push(`too short: ratio ${ratio.toFixed(2)}, truncated or translated from an older source`)
    const max = source.length <= 20 ? settings.maxLengthRatio + 2 : settings.maxLengthRatio
    if (ratio > max) warnings.push(`long: ratio ${ratio.toFixed(2)}, check layout`)
  }
  return { errors, warnings }
}

function applyReplace(str, replace) {
  let out = str
  for (const [from, to] of Object.entries(replace)) out = out.split(from).join(to)
  return out
}

// ---------- state ----------

function statePaths(settings) {
  const d = settings.stateDir
  return {
    jobs: path.join(d, 'jobs'),
    out: path.join(d, 'out'),
    rejects: path.join(d, 'rejects'),
    archive: path.join(d, 'archive'),
    hashes: path.join(d, 'source-hashes.json'),
    locked: path.join(d, 'locked.json'),
  }
}

function isLocked(locked, locale, key) {
  const list = locked[locale] || []
  return list.some((p) => (p.endsWith('*') ? key.startsWith(p.slice(0, -1)) : key === p))
}

function sourceEntries(settings) {
  const { flat } = loadLocale(settings, settings.sourceLocale)
  if (flat.size === 0) throw new Error(`No source messages found for "${settings.sourceLocale}" (${settings.pattern})`)
  return [...flat].filter(([k, v]) => v.trim() !== '' && !settings.skipKeys.test(k.split('::').pop().split('.').pop()))
}

// ---------- commands ----------

function cmdStats(settings, args) {
  const src = sourceEntries(settings)
  const chars = src.reduce((n, [, v]) => n + v.length, 0)
  const words = src.reduce((n, [, v]) => n + (v.match(/\S+/g) || []).length, 0)
  const hashes = readJson(statePaths(settings).hashes, {})
  const rows = settings.targets.map((locale) => {
    const { flat } = loadLocale(settings, locale)
    let missing = 0; let stale = 0; let workChars = 0
    for (const [k, v] of src) {
      const tv = flat.get(k)
      const h = hashes[locale]?.[k]
      if (tv === undefined || tv.trim() === '') { missing++; workChars += v.length }
      else if (h && h !== hashSource(v)) { stale++; workChars += v.length }
    }
    return { locale, missing, stale, workChars }
  })
  const totalWork = rows.reduce((n, r) => n + r.workChars, 0)
  const result = {
    sourceLocale: settings.sourceLocale,
    keys: src.length,
    sourceChars: chars,
    sourceWords: words,
    locales: rows,
    estimate: {
      inputTokens: Math.round(totalWork / 4 * 1.6), // + prompt/glossary overhead
      outputTokens: Math.round(totalWork / 4 * 1.3),
      machineTranslationCharsUSD20perM: +(totalWork / 1e6 * 20).toFixed(2),
      note: 'Token counts are rough (chars/4). Multiply by your model price per 1M tokens.',
    },
  }
  if (args.json) { console.log(JSON.stringify(result, null, 2)); return 0 }
  console.log(`Source ${settings.sourceLocale}: ${src.length} keys, ${chars} chars, ${words} words`)
  console.log('\nlocale  missing  stale  chars-to-translate')
  for (const r of rows) console.log(`${r.locale.padEnd(7)} ${String(r.missing).padStart(7)} ${String(r.stale).padStart(6)} ${String(r.workChars).padStart(18)}`)
  console.log(`\nEstimate: ~${result.estimate.inputTokens} input + ~${result.estimate.outputTokens} output tokens (LLM), or ~$${result.estimate.machineTranslationCharsUSD20perM} at $20/1M chars (MT API).`)
  return 0
}

function cmdCheck(settings, args) {
  const src = sourceEntries(settings)
  const srcMap = loadLocale(settings, settings.sourceLocale).flat // includes empty values
  const maxList = Number(args['max-list'] || 20)
  const report = []
  let errorCount = 0
  let warnCount = 0
  for (const locale of settings.targets) {
    const { flat, files } = loadLocale(settings, locale)
    const missingFiles = Object.entries(files).filter(([, f]) => !f.tree).map(([f]) => f)
    const issues = {} // rule -> [{key, detail}]
    const add = (level, rule, key, detail) => {
      const id = `${level}:${rule}`
      ;(issues[id] ||= []).push({ key, detail })
      if (level === 'error') errorCount++; else warnCount++
    }
    for (const f of missingFiles) add('error', 'missing file', f, '')
    for (const [k, v] of src) {
      const tv = flat.get(k)
      if (tv === undefined) { add('error', 'missing key', k, ''); continue }
      const { errors, warnings } = validatePair({ key: k, source: v, translation: tv, locale, settings })
      for (const e of errors) add('error', e.split(':')[0], k, e)
      for (const w of warnings) add('warn', w.split(':')[0], k, w)
    }
    for (const k of flat.keys()) {
      if (!srcMap.has(k) && !settings.skipKeys.test(k.split('::').pop().split('.').pop())) add('warn', 'orphan key (not in source)', k, '')
    }
    report.push({ locale, issues })
  }
  if (args.json) {
    console.log(JSON.stringify({ errors: errorCount, warnings: warnCount, report }, null, 2))
    return errorCount ? 1 : 0
  }
  for (const { locale, issues } of report) {
    const ids = Object.keys(issues).sort()
    if (!ids.length) { console.log(`[${locale}] OK`); continue }
    console.log(`[${locale}]`)
    for (const id of ids) {
      const list = issues[id]
      console.log(`  ${id} (${list.length})`)
      if (id.startsWith('warn:') && !args.warnings) continue
      for (const it of list.slice(0, maxList)) console.log(`    - ${it.key}${it.detail.includes(': ') ? `  (${it.detail.split(': ').slice(1).join(': ')})` : ''}`)
      if (list.length > maxList) console.log(`    ... ${list.length - maxList} more`)
    }
  }
  console.log(`\n${errorCount} error(s), ${warnCount} warning(s) across ${settings.targets.length} locale(s).`)
  return errorCount ? 1 : 0
}

function cmdPrep(settings) {
  const p = statePaths(settings)
  const src = sourceEntries(settings)
  const hashes = readJson(p.hashes, {})
  const locked = readJson(p.locked, {})
  const context = settings.contextFile ? readJson(settings.contextFile, {}) : {}
  const contextFor = (key) => {
    if (context[key]) return context[key]
    const prefix = Object.keys(context).filter((c) => c.endsWith('*') && key.startsWith(c.slice(0, -1))).sort((a, b) => b.length - a.length)[0]
    return prefix ? context[prefix] : undefined
  }
  const summary = []
  for (const locale of settings.targets) {
    const { flat } = loadLocale(settings, locale)
    const items = []
    let missing = 0; let stale = 0; let untranslated = 0; let invalid = 0
    for (const [k, v] of src) {
      const tv = flat.get(k)
      const h = hashes[locale]?.[k]
      let reason = null
      if (tv === undefined || tv.trim() === '') { reason = 'missing'; missing++ }
      else if (isLocked(locked, locale, k)) continue
      else if (h && h !== hashSource(v)) { reason = 'stale'; stale++ }
      else {
        const errs = validatePair({ key: k, source: v, translation: tv, locale, settings }).errors
        if (!h && errs.some((e) => e.startsWith('identical'))) { reason = 'untranslated'; untranslated++ }
        else if (errs.some((e) => !e.startsWith('identical'))) { reason = 'invalid'; invalid++ }
      }
      if (!reason) continue
      const item = { key: k, source: v, reason }
      const c = contextFor(k)
      if (c) item.context = c
      if (reason !== 'missing') item.previous = tv
      items.push(item)
    }
    // batch: long strings to balanced tier
    const groups = { fast: items.filter((x) => x.source.length <= settings.longform), balanced: items.filter((x) => x.source.length > settings.longform) }
    const jobs = []
    for (const [tier, list] of Object.entries(groups)) {
      let cur = []; let chars = 0
      for (const it of list) {
        if (cur.length && (cur.length >= settings.batch || chars + it.source.length > settings.batchChars)) { jobs.push({ tier, items: cur }); cur = []; chars = 0 }
        cur.push(it); chars += it.source.length
      }
      if (cur.length) jobs.push({ tier, items: cur })
    }
    if (!settings.dryRun) {
      fs.mkdirSync(p.jobs, { recursive: true })
      for (const f of fs.readdirSync(p.jobs)) if (f.startsWith(`${locale}.`)) fs.rmSync(path.join(p.jobs, f))
      const meta = settings.localeMeta[locale] || {}
      jobs.forEach((job, idx) => {
        const id = `${locale}.${String(idx + 1).padStart(3, '0')}`
        const style = [settings.glossary.style.default, settings.glossary.style[locale] || settings.glossary.style[baseLang(locale)]].filter(Boolean).join(' ')
        writeJson(path.join(p.jobs, `${id}.json`), {
          version: 1,
          job: id,
          sourceLocale: settings.sourceLocale,
          targetLocale: locale,
          targetLanguage: meta.englishName || meta.label || locale,
          tier: job.tier,
          style: style || undefined,
          glossary: {
            doNotTranslate: settings.glossary.doNotTranslate.map((e) => e.term),
            approvedNativeForms: Object.fromEntries(settings.glossary.doNotTranslate
              .map((e) => [e.term, e.allow[locale] || e.allow[baseLang(locale)]]).filter(([, v]) => v && v.length)),
            terms: settings.glossary.terms[locale] || settings.glossary.terms[baseLang(locale)] || {},
          },
          rules: [
            'Translate every item. Return each key exactly once.',
            'Keep {placeholders}, ICU plural/select syntax and keywords (plural, select, one, other, =0, #), HTML/XML tags, URLs and Markdown link targets exactly as in the source. Translate only the human text inside plural/select branches.',
            'Never translate, transliterate or repeat doNotTranslate terms (brand, product, company, program and model names). Copy them exactly, letter for letter. The only exception is approvedNativeForms: for those terms you may use one of the listed native-script spellings instead.',
            'Translate the words around a brand naturally, but leave brand + model strings intact (e.g. "DJI Dock 3", "FlightHub 2").',
            'Use the glossary terms when the source term appears.',
            'Items with "previous" are re-translations: the source changed (reason "stale"), the value was still in the source language (reason "untranslated"), or it failed validation (reason "invalid": fix placeholders, tags, glossary terms). Keep previous wording where the meaning did not change. If a value is genuinely the same in the target language (a proper noun, an international term), return it unchanged.',
          ],
          items: job.items,
          output: path.join(p.out, `${id}.json`),
        })
      })
    }
    summary.push({ locale, missing, stale, untranslated, invalid, jobs: jobs.length, fast: groups.fast.length, balanced: groups.balanced.length })
  }
  console.log('locale  missing  stale  untranslated  invalid  jobs (fast/balanced items)')
  for (const s of summary) console.log(`${s.locale.padEnd(7)} ${String(s.missing).padStart(7)} ${String(s.stale).padStart(6)} ${String(s.untranslated).padStart(13)} ${String(s.invalid).padStart(8)}  ${s.jobs} (${s.fast}/${s.balanced})`)
  if (settings.dryRun) console.log('\n(dry run: no job files written)')
  else console.log(`\nJobs written to ${statePaths(settings).jobs}. Translator writes outputs to ${statePaths(settings).out}/<job>.json, then run "apply".`)
  return 0
}

function validateJobOutput(settings, job, out) {
  const accepted = new Map()
  const rejects = []
  const warnings = []
  const translations = out?.translations || {}
  const known = new Set(job.items.map((i) => i.key))
  for (const k of Object.keys(translations)) if (!known.has(k)) warnings.push({ key: k, issue: 'unknown key in output (ignored)' })
  for (const item of job.items) {
    let tr = translations[item.key]
    if (typeof tr === 'string') tr = applyReplace(tr, settings.replace)
    const { errors, warnings: w } = validatePair({ key: item.key, source: item.source, translation: tr, locale: job.targetLocale, settings, reason: item.reason })
    if (errors.length) rejects.push({ key: item.key, source: item.source, translation: tr ?? null, errors })
    else {
      accepted.set(item.key, tr)
      for (const x of w) warnings.push({ key: item.key, issue: x })
    }
  }
  return { accepted, rejects, warnings }
}

function cmdValidate(settings, args) {
  if (!args.job || !args.out) throw new Error('validate needs --job <file> --out <file>')
  const job = readJson(args.job)
  const out = readJson(args.out)
  const { accepted, rejects, warnings } = validateJobOutput(settings, job, out)
  console.log(JSON.stringify({ accepted: accepted.size, rejects, warnings }, null, 2))
  return rejects.length ? 1 : 0
}

function cmdApply(settings, args) {
  const p = statePaths(settings)
  if (!fs.existsSync(p.out)) { console.log(`No outputs in ${p.out}`); return 0 }
  const outFiles = fs.readdirSync(p.out).filter((f) => f.endsWith('.json')).sort()
  const byLocale = new Map()
  for (const f of outFiles) {
    const id = f.replace(/\.json$/, '')
    const jobFile = path.join(p.jobs, `${id}.json`)
    if (!fs.existsSync(jobFile)) { console.warn(`skip ${f}: no matching job ${jobFile}`); continue }
    const job = readJson(jobFile)
    if (!settings.targets.includes(job.targetLocale)) continue
    let out
    try { out = readJson(path.join(p.out, f)) } catch (err) { console.warn(`reject ${f}: ${err.message}`); continue }
    const res = validateJobOutput(settings, job, out)
    const entry = byLocale.get(job.targetLocale) || { accepted: new Map(), rejects: [], warnings: [], files: [] }
    for (const [k, v] of res.accepted) entry.accepted.set(k, v)
    entry.rejects.push(...res.rejects.map((r) => ({ ...r, job: id })))
    entry.warnings.push(...res.warnings.map((w) => ({ ...w, job: id })))
    entry.files.push(id)
    byLocale.set(job.targetLocale, entry)
  }
  const hashes = readJson(p.hashes, {})
  const srcMap = new Map(sourceEntries(settings))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let totalRejects = 0
  for (const [locale, entry] of byLocale) {
    const { flat } = loadLocale(settings, locale)
    for (const [k, v] of entry.accepted) {
      flat.set(k, v)
      if (srcMap.has(k)) (hashes[locale] ||= {})[k] = hashSource(srcMap.get(k))
    }
    const files = writeLocale(settings, locale, flat, { prune: Boolean(args.prune) })
    totalRejects += entry.rejects.length
    console.log(`[${locale}] accepted ${entry.accepted.size}, rejected ${entry.rejects.length}, warnings ${entry.warnings.length} -> ${files.join(', ')}`)
    for (const r of entry.rejects.slice(0, 10)) console.log(`    REJECT ${r.key}: ${r.errors.join('; ')}`)
    for (const w of entry.warnings.slice(0, 5)) console.log(`    warn   ${w.key}: ${w.issue}`)
    if (!settings.dryRun) {
      const rejectFile = path.join(p.rejects, `${locale}.json`)
      if (entry.rejects.length) writeJson(rejectFile, { locale, created: new Date().toISOString(), items: entry.rejects })
      else if (fs.existsSync(rejectFile)) fs.rmSync(rejectFile)
      const arch = path.join(p.archive, stamp)
      fs.mkdirSync(arch, { recursive: true })
      for (const id of entry.files) {
        fs.renameSync(path.join(p.out, `${id}.json`), path.join(arch, `${id}.out.json`))
        fs.renameSync(path.join(p.jobs, `${id}.json`), path.join(arch, `${id}.job.json`))
      }
    }
  }
  if (!settings.dryRun) writeJson(p.hashes, hashes)
  if (settings.dryRun) console.log('(dry run: nothing written)')
  if (totalRejects) console.log(`\n${totalRejects} reject(s) in ${p.rejects}. Re-run "prep" to queue them again (balanced tier), or fix by hand.`)
  return totalRejects ? 2 : 0
}

function cmdAdopt(settings) {
  const p = statePaths(settings)
  const hashes = readJson(p.hashes, {})
  const src = sourceEntries(settings)
  for (const locale of settings.targets) {
    const { flat } = loadLocale(settings, locale)
    let n = 0
    for (const [k, v] of src) {
      const tv = flat.get(k)
      if (!tv || !tv.trim() || hashes[locale]?.[k]) continue
      // never adopt a value that is still in the source language
      if (validatePair({ key: k, source: v, translation: tv, locale, settings }).errors.some((e) => e.startsWith('identical'))) continue
      ;(hashes[locale] ||= {})[k] = hashSource(v)
      n++
    }
    console.log(`[${locale}] adopted ${n} existing translation(s) as current`)
  }
  if (!settings.dryRun) writeJson(p.hashes, hashes)
  return 0
}

const ACCENTS = { a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ', n: 'ñ', o: 'ö', p: 'þ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', w: 'ŵ', y: 'ý', z: 'ž', A: 'Å', C: 'Ç', E: 'É', I: 'Î', N: 'Ñ', O: 'Ö', U: 'Û' }

function pseudoize(str, settings) {
  // protect placeholders/tags/urls/glossary, accent the rest, pad ~35%
  const protectRe = new RegExp([
    String.raw`\{[^{}]*\}`, String.raw`<[^<>]+>`, String.raw`https?://\S+`, String.raw`\{\{[^}]*\}\}`, String.raw`%(\d+\$)?[sdif@]`,
    ...settings.glossary.doNotTranslate.map((e) => escapeRe(e.term)),
  ].join('|'), 'g')
  // ICU: only accent text, keep structure: crude but safe because we keep every {...} untouched
  let out = ''; let last = 0
  for (const m of str.matchAll(protectRe)) {
    out += [...str.slice(last, m.index)].map((ch) => ACCENTS[ch] || ch).join('') + m[0]
    last = m.index + m[0].length
  }
  out += [...str.slice(last)].map((ch) => ACCENTS[ch] || ch).join('')
  const pad = '~'.repeat(Math.max(1, Math.round(str.length * 0.35)))
  return `[${out} ${pad}]`
}

function cmdPseudo(settings, args) {
  const code = args['pseudo-locale'] || 'en-XA'
  const src = loadLocale(settings, settings.sourceLocale)
  const flat = new Map()
  for (const [k, v] of src.flat) {
    // ICU messages with plural/select keep their text branches untouched to stay parseable
    flat.set(k, analyzeIcu(v).selects.length ? v : pseudoize(v, settings))
  }
  const settings2 = { ...settings }
  const tgt = loadLocale(settings2, code)
  for (const [file, info] of Object.entries(tgt.files)) {
    const tree = rebuild(src.files[info.sourceFile]?.tree, info.ns, flat) || {}
    if (!settings.dryRun) writeJson(file, tree)
    console.log(`wrote ${file}`)
  }
  console.log(`Add "${code}" to your locales temporarily (dev only, never deploy) to review layout and spot hardcoded strings.`)
  return 0
}

function cmdSuggestGlossary(settings, args) {
  const src = sourceEntries(settings)
  const known = new Set(settings.glossary.doNotTranslate.map((e) => e.term))
  const patterns = [
    ['brand (CamelCase)', /\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b/g],
    ['name + model number', /\b[A-Z][\w-]*(?:\s[A-Z][\w-]*){0,2}\s\d+[A-Za-z0-9]*\b/g],
    ['trademark', /[\p{L}\p{N}][\p{L}\p{N} .-]{1,40}(?:™|®)/gu],
    ['acronym', /\b[A-Z]{2,6}[0-9]*\b/g],
    ['lowercase-start brand', /\b[a-z]+[A-Z][A-Za-z]+\b/g],
  ]
  const found = new Map() // term -> { kind, count, keys:Set, example }
  for (const [key, value] of src) {
    const text = visibleText(value).replace(/https?:\/\/\S+|\S+@\S+/g, ' ')
    for (const [kind, re] of patterns) {
      for (const m of text.matchAll(re)) {
        const term = m[0].trim()
        if (term.length < 2 || known.has(term)) continue
        const f = found.get(term) || { kind, count: 0, keys: new Set(), example: key }
        f.count++
        f.keys.add(key)
        found.set(term, f)
      }
    }
  }
  const min = Number(args.min || 2)
  const rows = [...found].filter(([, f]) => f.count >= min).sort((a, b) => b[1].count - a[1].count)
  if (args.json) { console.log(JSON.stringify(rows.map(([term, f]) => ({ term, kind: f.kind, count: f.count, keys: f.keys.size, example: f.example })), null, 2)); return 0 }
  console.log(`Candidate do-not-translate terms (seen >= ${min} times, not yet in glossary):\n`)
  console.log('count  keys  kind                    term')
  for (const [term, f] of rows.slice(0, Number(args.top || 80))) console.log(`${String(f.count).padStart(5)} ${String(f.keys.size).padStart(5)}  ${f.kind.padEnd(22)}  ${term}`)
  console.log(`\nReview before adding. Keep: company, product, model, program, trademark and person names.
Drop: generic acronyms that ARE localized in some languages (AI -> IA in fr/es, API stays API, ROI, FAQ...),
and ordinary capitalized words. Then add the kept terms to glossary.json "doNotTranslate".`)
  return 0
}

// ---------- main ----------

const COMMANDS = { 'suggest-glossary': cmdSuggestGlossary, stats: cmdStats, check: cmdCheck, prep: cmdPrep, apply: cmdApply, validate: cmdValidate, adopt: cmdAdopt, pseudo: cmdPseudo }

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0]
  if (!cmd || args.help || !COMMANDS[cmd]) { console.log(HELP); return cmd && !args.help ? 1 : 0 }
  const settings = loadSettings(args)
  return COMMANDS[cmd](settings, args)
}

try {
  process.exitCode = main()
} catch (err) {
  console.error(`i18n-messages: ${err.message}`)
  process.exitCode = 1
}

export { analyzeIcu, validatePair, flatten, hashSource }
