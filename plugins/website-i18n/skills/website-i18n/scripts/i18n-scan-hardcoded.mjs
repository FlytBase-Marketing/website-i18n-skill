#!/usr/bin/env node
// i18n-scan-hardcoded.mjs: heuristic count of user-facing text hardcoded in
// templates (tsx/jsx/vue/svelte/astro/html) instead of coming from messages.
// Use it to size extraction work in an audit, and as a CI gate for stacks
// without a lint rule (--baseline + --fail-on-new). Zero dependencies.

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const HELP = `Usage: node i18n-scan-hardcoded.mjs <dir...> [options]

  --ext <list>          Extensions (default tsx,jsx,vue,svelte,astro,html)
  --allow <list>        Comma list of strings to ignore (brand names, symbols)
  --glossary <file>     Also ignore glossary doNotTranslate terms
  --top <n>             Show top n files (default 25)
  --show <n>            Show up to n sample strings per file (default 3)
  --baseline <file>     JSON {file: count} to compare against
  --write-baseline      Write current counts to --baseline
  --fail-on-new         Exit 1 when any file has more hits than its baseline
  --json                Machine-readable output
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

const SKIP_DIRS = new Set(['node_modules', '.next', '.nuxt', '.svelte-kit', '.astro', 'dist', 'build', 'out', '.git', 'coverage', '.vercel', 'public', 'static', '__tests__', '__mocks__'])

function walk(dir, exts, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), exts, out); continue }
    if (/\.(test|spec|stories)\.[^.]+$/.test(entry.name)) continue
    if (exts.has(path.extname(entry.name).slice(1))) out.push(path.join(dir, entry.name))
  }
  return out
}

function templatePart(file, src) {
  const ext = path.extname(file).slice(1)
  let s = src
  if (ext === 'astro') s = s.replace(/^---[\s\S]*?---/, '')
  if (['vue', 'svelte', 'astro', 'html'].includes(ext)) {
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  }
  // drop comments
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  if (['tsx', 'jsx'].includes(ext)) s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  return s
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length
}

function scanFile(file, allow) {
  const raw = fs.readFileSync(file, 'utf8')
  const src = templatePart(file, raw)
  const ext = path.extname(file).slice(1)
  const hits = []
  const isText = (t) => {
    const s = t.replace(/\s+/g, ' ').trim()
    if (!s || !/\p{L}{2,}/u.test(s)) return false
    // looks like code, not copy
    if (/[=;{}]|=>|&&|\|\||\?\.|`|\$\{/.test(s)) return false
    if (/\b(const|let|var|return|function|await|async|import|export|typeof|interface|type)\b/.test(s)) return false
    if (/^[\w.$]+\(|^[\w.]+$|^\)|\($/.test(s) && !/\s\p{L}+\s/u.test(s)) return false
    let rest = s
    for (const a of allow) rest = rest.split(a).join(' ')
    return /\p{L}{2,}/u.test(rest)
  }
  // text nodes between tags (outside {expressions} for jsx/svelte/astro/vue mustaches)
  // ">" must close a tag (not "=>" / "->") and "<" must open or close one
  for (const m of src.matchAll(/(?<![=\-])>([^<>]+)<(?=[\/\p{L}!])/gu)) {
    let t = m[1]
    if (['tsx', 'jsx', 'svelte', 'astro'].includes(ext)) t = t.replace(/\{[^{}]*\}/g, ' ')
    if (ext === 'vue' || ext === 'html') t = t.replace(/\{\{[\s\S]*?\}\}/g, ' ')
    if (isText(t)) hits.push({ line: lineOf(src, m.index), text: t.replace(/\s+/g, ' ').trim().slice(0, 80), kind: 'text' })
  }
  // user-facing attributes with literal values
  for (const m of src.matchAll(/\b(alt|title|placeholder|aria-label|aria-description|label)\s*=\s*"([^"{}]*)"/g)) {
    if (isText(m[2])) hits.push({ line: lineOf(src, m.index), text: `${m[1]}="${m[2].slice(0, 70)}"`, kind: 'attr' })
  }
  return hits
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args._.length === 0) { console.log(HELP); return args.help ? 0 : 1 }
  const exts = new Set(String(args.ext || 'tsx,jsx,vue,svelte,astro,html').split(','))
  const allow = String(args.allow || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (args.glossary) {
    const g = JSON.parse(fs.readFileSync(args.glossary, 'utf8'))
    for (const e of g.doNotTranslate || []) allow.push(typeof e === 'string' ? e : e.term)
  }
  const files = args._.flatMap((d) => walk(d, exts, []))
  const results = files.map((f) => ({ file: f, hits: scanFile(f, allow) })).filter((r) => r.hits.length)
  results.sort((a, b) => b.hits.length - a.hits.length)
  const total = results.reduce((n, r) => n + r.hits.length, 0)
  const counts = Object.fromEntries(results.map((r) => [r.file, r.hits.length]))

  if (args['write-baseline']) {
    if (!args.baseline) throw new Error('--write-baseline needs --baseline <file>')
    fs.writeFileSync(args.baseline, JSON.stringify(counts, null, 2) + '\n')
    console.log(`Baseline written: ${args.baseline} (${results.length} files, ${total} hits)`)
    return 0
  }
  let regressions = []
  if (args.baseline && fs.existsSync(args.baseline)) {
    const base = JSON.parse(fs.readFileSync(args.baseline, 'utf8'))
    regressions = results.filter((r) => r.hits.length > (base[r.file] || 0)).map((r) => ({ file: r.file, now: r.hits.length, before: base[r.file] || 0 }))
  }
  if (args.json) {
    console.log(JSON.stringify({ files: files.length, filesWithHits: results.length, total, results, regressions }, null, 2))
  } else {
    const top = Number(args.top || 25); const show = Number(args.show || 3)
    console.log(`Scanned ${files.length} template file(s): ${total} likely hardcoded string(s) in ${results.length} file(s).\n`)
    for (const r of results.slice(0, top)) {
      console.log(`${String(r.hits.length).padStart(4)}  ${r.file}`)
      for (const h of r.hits.slice(0, show)) console.log(`        L${h.line} ${h.kind === 'attr' ? '' : '"'}${h.text}${h.kind === 'attr' ? '' : '"'}`)
    }
    if (results.length > top) console.log(`  ... ${results.length - top} more file(s)`)
    if (regressions.length) {
      console.log(`\nNew hardcoded strings vs baseline:`)
      for (const r of regressions) console.log(`  ${r.file}: ${r.before} -> ${r.now}`)
    }
    console.log('\nHeuristic: expect some false positives (code-like text, symbols). Prefer the framework lint rule where one exists.')
  }
  return args['fail-on-new'] && regressions.length ? 1 : 0
}

try { process.exitCode = main() } catch (err) { console.error(`i18n-scan-hardcoded: ${err.message}`); process.exitCode = 1 }
