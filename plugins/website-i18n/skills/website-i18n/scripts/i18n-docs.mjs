#!/usr/bin/env node
// i18n-docs.mjs: translation jobs and structure checks for Markdown/MDX
// content (blogs, docs). Zero dependencies, Node 18+. Part of website-i18n.
//
//   prep   write document jobs for missing or stale translations
//   check  compare each translated file with its source: frontmatter keys,
//          headings, code blocks, links, images, MDX components, glossary,
//          untranslated body, staleness (sourceHash)

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const HELP = `Usage: node i18n-docs.mjs <prep|check> --source <dir> --target <pattern> --locales a,b [options]

  --source <dir>        Source-language content dir, e.g. content/blog/en
  --target <pattern>    Target dir pattern with {locale}, e.g. content/blog/{locale}
  --locales <list>      Target locales (or from --config locales)
  --config <file>       i18n.config.json (reads docs.source / docs.target / glossary / locales)
  --glossary <file>     Glossary JSON
  --translate-keys <l>  Frontmatter keys to translate (default title,description,excerpt,summary)
  --state <dir>         Job dir root (default .i18n)
  --include-reviewed    (prep) also queue stale files marked translationStatus: reviewed
  --file <path>         (check) check one translated file only
  --dry-run
`

function parseArgs(argv) {
  const a = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    if (x.startsWith('--')) {
      const k = x.slice(2); const n = argv[i + 1]
      if (n === undefined || n.startsWith('--')) a[k] = true
      else { a[k] = n; i++ }
    } else a._.push(x)
  }
  return a
}

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { if (fb !== undefined) return fb; throw e } }
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12)

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(md|mdx|markdown)$/.test(e.name)) out.push(p)
  }
  return out
}

// Minimal frontmatter: top-level "key: value" lines (multi-line values kept raw).
function splitDoc(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { fm: {}, fmRaw: '', body: text }
  const fm = {}
  let cur = null
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s?(.*)$/)
    if (kv) { cur = kv[1]; fm[cur] = kv[2] } else if (cur) fm[cur] += '\n' + line
  }
  return { fm, fmRaw: m[1], body: text.slice(m[0].length) }
}

function structure(body) {
  const codeBlocks = [...body.matchAll(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm)].map((m) => m[0])
  const noCode = body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm, '').replace(/`[^`\n]+`/g, '`code`')
  return {
    codeBlocks,
    inlineCode: [...body.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]).filter((c) => !codeBlocks.some((b) => b.includes(c))),
    headings: [...noCode.matchAll(/^(#{1,6})\s/gm)].map((m) => m[1].length),
    links: [...noCode.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]),
    hrefs: [...noCode.matchAll(/\bhref=["']([^"']+)["']/g)].map((m) => m[1]),
    images: [...noCode.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((m) => m[1]).concat([...noCode.matchAll(/\bsrc=["']([^"']+)["']/g)].map((m) => m[1])),
    components: [...noCode.matchAll(/<([A-Z][\w.]*)/g)].map((m) => m[1]),
    imports: [...body.matchAll(/^(import|export)\s.*$/gm)].map((m) => m[0]),
    listItems: [...noCode.matchAll(/^\s*([-*+]|\d+\.)\s/gm)].length,
    text: noCode.replace(/<[^>]+>/g, ' ').replace(/[#>*_\-[\]()!|]/g, ' ').replace(/\s+/g, ' ').trim(),
  }
}

function sameList(a, b) {
  return a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])
}

function words(t) { return new Set((t.toLowerCase().match(/\p{L}{3,}/gu) || []).slice(0, 5000)) }
function jaccard(a, b) { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n) }

function loadGlossary(file) {
  const g = file ? readJson(file, {}) : {}
  return (g.doNotTranslate || []).map((e) => (typeof e === 'string' ? { term: e, allow: {} } : { term: e.term, allow: e.allow || {} }))
}

function settingsFrom(args) {
  const config = args.config ? readJson(args.config) : (fs.existsSync('i18n.config.json') ? readJson('i18n.config.json') : {})
  const source = args.source || config.docs?.source
  const target = args.target || config.docs?.target
  if (!source || !target || !target.includes('{locale}')) throw new Error('Need --source <dir> and --target <pattern with {locale}> (or docs.source/docs.target in config)')
  const srcLocale = config.sourceLocale || 'en'
  let locales = args.locales ? String(args.locales).split(',') : (config.locales || []).map((l) => (typeof l === 'string' ? l : l.code)).filter((l) => l !== srcLocale)
  if (!locales.length) throw new Error('No target locales (--locales or config.locales)')
  return {
    config, source, target, locales, srcLocale,
    glossary: loadGlossary(args.glossary || config.glossary),
    translateKeys: String(args['translate-keys'] || config.docs?.translateFrontmatter?.join(',') || 'title,description,excerpt,summary').split(','),
    state: args.state || config.stateDir || '.i18n',
    meta: Object.fromEntries((config.locales || []).filter((l) => typeof l === 'object').map((l) => [l.code, l])),
  }
}

function targetPath(s, locale, srcFile) {
  return path.join(s.target.split('{locale}').join(locale), path.relative(s.source, srcFile))
}

function cmdPrep(s, args) {
  const files = walk(s.source)
  const jobsDir = path.join(s.state, 'jobs')
  const rows = []
  for (const locale of s.locales) {
    let missing = 0; let stale = 0; let skipped = 0
    for (const f of files) {
      const srcText = fs.readFileSync(f, 'utf8')
      const hash = sha(srcText)
      const tgt = targetPath(s, locale, f)
      let reason = null
      if (!fs.existsSync(tgt)) { reason = 'missing'; missing++ } else {
        const { fm } = splitDoc(fs.readFileSync(tgt, 'utf8'))
        const recorded = (fm.sourceHash || '').replace(/['"]/g, '').trim()
        if (recorded && recorded !== hash) {
          if (/reviewed/.test(fm.translationStatus || '') && !args['include-reviewed']) { skipped++; continue }
          reason = 'stale'; stale++
        }
      }
      if (!reason) continue
      const id = `doc.${locale}.${path.relative(s.source, f).replace(/[\\/]/g, '__').replace(/\.(md|mdx|markdown)$/, '')}`
      const job = {
        version: 1, type: 'document', job: id, reason,
        sourceLocale: s.srcLocale, targetLocale: locale, targetLanguage: s.meta[locale]?.englishName || locale,
        tier: 'balanced', source: f, target: tgt, sourceHash: hash,
        previousTranslation: reason === 'stale' ? tgt : undefined,
        translateFrontmatter: s.translateKeys,
        glossary: {
          doNotTranslate: s.glossary.map((g) => g.term),
          approvedNativeForms: Object.fromEntries(s.glossary.map((g) => [g.term, g.allow[locale]]).filter(([, v]) => v && v.length)),
        },
        validate: `node scripts/i18n/i18n-docs.mjs check --source ${s.source} --target '${s.target}' --locales ${locale} --file ${tgt}`,
      }
      if (!args['dry-run']) { fs.mkdirSync(jobsDir, { recursive: true }); fs.writeFileSync(path.join(jobsDir, `${id}.json`), JSON.stringify(job, null, 2) + '\n') }
    }
    rows.push({ locale, missing, stale, skipped })
  }
  console.log(`Source docs: ${files.length}\nlocale  missing  stale  stale-but-reviewed(skipped)`)
  for (const r of rows) console.log(`${r.locale.padEnd(7)} ${String(r.missing).padStart(7)} ${String(r.stale).padStart(6)} ${String(r.skipped).padStart(12)}`)
  console.log(args['dry-run'] ? '(dry run)' : `Document jobs in ${jobsDir} (tier balanced).`)
  return 0
}

function checkPair(s, srcFile, tgtFile, locale) {
  const errors = []; const warnings = []
  const srcText = fs.readFileSync(srcFile, 'utf8')
  const tgtText = fs.readFileSync(tgtFile, 'utf8')
  const a = splitDoc(srcText); const b = splitDoc(tgtText)
  for (const k of Object.keys(a.fm)) if (!(k in b.fm)) errors.push(`frontmatter key missing: ${k}`)
  for (const k of Object.keys(a.fm)) {
    if (k in b.fm && !s.translateKeys.includes(k) && a.fm[k].trim() !== b.fm[k].trim() && !['slug', 'translationKey'].includes(k)) warnings.push(`frontmatter "${k}" differs from source (should usually be copied)`)
  }
  for (const k of s.translateKeys) if (a.fm[k] && b.fm[k] && a.fm[k].trim() === b.fm[k].trim() && /\p{L}{3,}/u.test(a.fm[k])) errors.push(`frontmatter "${k}" not translated`)
  const recorded = (b.fm.sourceHash || '').replace(/['"]/g, '').trim()
  if (!recorded) warnings.push('no sourceHash in frontmatter (staleness cannot be tracked)')
  else if (recorded !== sha(srcText)) warnings.push('stale: source changed since translation')
  const sa = structure(a.body); const sb = structure(b.body)
  if (!sameList(sa.codeBlocks, sb.codeBlocks)) errors.push(`code blocks changed (${sa.codeBlocks.length} vs ${sb.codeBlocks.length}, or content differs)`)
  if (sa.headings.join(',') !== sb.headings.join(',')) errors.push(`heading structure differs: [${sa.headings.join(',')}] vs [${sb.headings.join(',')}]`)
  // pointing an internal link at the same page in this locale (/fr/x) is allowed
  const delocalize = (u) => u.replace(new RegExp(`^((?:https?://[^/]+)?)/${locale}(?=/|$)`), '$1') || '/'
  if (!sameList(sa.links, sb.links.map(delocalize))) errors.push(`link targets differ: [${sa.links.join(' ')}] vs [${sb.links.join(' ')}]`)
  if (!sameList(sa.hrefs, sb.hrefs.map(delocalize))) errors.push('href targets differ')
  if (!sameList(sa.images, sb.images)) errors.push('image sources differ')
  if (!sameList(sa.components, sb.components)) errors.push(`MDX components differ: [${sa.components.join(' ')}] vs [${sb.components.join(' ')}]`)
  if (sa.imports.join('\n') !== sb.imports.join('\n')) errors.push('import/export lines changed')
  if (Math.abs(sa.listItems - sb.listItems) > 0) warnings.push(`list item count differs (${sa.listItems} vs ${sb.listItems})`)
  const sim = jaccard(words(sa.text), words(sb.text))
  if (sim > 0.7) errors.push(`body looks untranslated (${Math.round(sim * 100)}% word overlap)`)
  const full = b.fm.title + ' ' + b.body
  const srcFull = a.fm.title + ' ' + a.body
  for (const { term, allow } of s.glossary) {
    const forms = [term, ...(allow[locale] || [])]
    if (srcFull.includes(term) && !forms.some((f) => full.includes(f))) errors.push(`glossary: "${term}" missing (translated or transliterated)`)
    for (const f of forms) if (new RegExp(`${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\u3000]*${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(full) && !srcFull.includes(`${term} ${term}`)) errors.push(`glossary: "${f}" repeated`)
  }
  const ratio = sb.text.length / Math.max(1, sa.text.length)
  if (ratio < (['ja', 'zh', 'ko'].includes(locale.split('-')[0]) ? 0.2 : 0.4)) errors.push(`much shorter than source (ratio ${ratio.toFixed(2)}): content may be missing`)
  return { errors, warnings }
}

function cmdCheck(s, args) {
  const files = walk(s.source)
  let errs = 0; let warns = 0
  for (const locale of s.locales) {
    for (const f of files) {
      const tgt = targetPath(s, locale, f)
      if (args.file && path.resolve(args.file) !== path.resolve(tgt)) continue
      if (!fs.existsSync(tgt)) { if (!args.file) { console.log(`[${locale}] missing ${tgt}`); warns++ } continue }
      const { errors, warnings } = checkPair(s, f, tgt, locale)
      if (!errors.length && !warnings.length) continue
      console.log(`[${locale}] ${tgt}`)
      for (const e of errors) console.log(`   error  ${e}`)
      for (const w of warnings) console.log(`   warn   ${w}`)
      errs += errors.length; warns += warnings.length
    }
  }
  console.log(`${errs} error(s), ${warns} warning(s).`)
  return errs ? 1 : 0
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0]
  if (!cmd || args.help || !['prep', 'check'].includes(cmd)) { console.log(HELP); return cmd && !args.help ? 1 : 0 }
  const s = settingsFrom(args)
  return cmd === 'prep' ? cmdPrep(s, args) : cmdCheck(s, args)
}

try { process.exitCode = main() } catch (err) { console.error(`i18n-docs: ${err.message}`); process.exitCode = 1 }
