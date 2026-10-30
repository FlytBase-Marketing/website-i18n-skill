# 10: Working with non-technical operators

The person running this skill is often a marketer, content lead or site
owner, not a developer. They must understand what is happening well enough to
approve each step and to explain it to their team. Your job is to do the work
**and** to leave them knowing more than when you started.

## The step loop (every step, no exceptions)

```
Explain the step (plain words + analogy) ──► Ask for approval ──► Do only that step
        ▲                                                              │
        └──── Report the result (plain words, proof, what's next) ◄────┘
```

1. **Before** a step, say:
   - what you will do
   - why it matters, in one analogy
   - what will change: files or pages, in their words ("the French pages",
     "the list Google reads")
   - the risk and how to undo it
   - the cost or time, if any
2. **Ask** for approval with a clear yes/no question: "Shall I go ahead with
   step 3?"
   - Never bundle several steps into one approval unless the person asks
     for that ("do steps 3 to 5").
   - A yes for one step is not a yes for the next.
3. **Do** only that step.
4. **After** the step, report:
   - what changed
   - the proof (a check that passed, a before/after example)
   - anything unexpected
   - what the next step is
   - then ask again

If a step uncovers something that changes the plan (a new decision, bigger
scope, URLs that must change), stop, explain, and ask. Do not quietly adapt.

## How to talk

- **Plain words first, the technical term second, in brackets:** "a list
  that tells Google which pages are the same page in other languages
  (hreflang)". Afterwards you can use the term, because they have now learned
  it.
- **One analogy per concept,** the first time it comes up. Reuse the same
  analogy later. Switching metaphors confuses people.
- **Short.** A summary fits on one screen. Put details in the checklist file
  and point to it.
- **Concrete examples from their own site:** "Your French pricing page shows
  English text to Google" beats "localized content not in SSR output".
- **Be honest about severity.** Use three words consistently:
  - **"Blocker"**: must fix before launching a language
  - **"Important"**: fix soon
  - **"Nice to have"**
- **No jargon dumps.** Never paste raw tool output as the explanation. Quote
  one line if it helps, then explain it.
- **Teach as you go.** Add one "Good to know" line per step, a takeaway they
  can reuse ("Rule of thumb: a page Google can't read without running code
  might as well not exist for AI search").
- **Check understanding at decision points:** "Does that make sense? Happy to
  explain any of these differently."

## Audit-complete message (template)

```
The audit is done. Nothing on the site has been changed yet.

In one sentence: <the overall state, e.g. "Your site is set up for 9 languages, but Google
sees English text on many French and German pages, and a few pages point to translations
that don't exist.">

What's working well
- <2-3 bullets, plain words>

Blockers (must fix before we rely on these languages)
1. <plain-language problem> - <analogy or why it matters> (checklist B1)
2. ...

Important (fix soon)
- ...

Decisions I need from you
1. <question>? I recommend <default> because <one line>.
2. Brand names: these will never be translated: FlytBase, DJI, DJI Dock 3, ... Anything to add or remove?
   Should any brand be written in Japanese/Chinese script on those pages? (default: no)

The plan (each step needs your OK before I start it)
Step 1 - <name>: <what changes, in plain words> - <risk> - <time/cost>
Step 2 - ...

Good to know: <one teaching line>

Full details with evidence: I18N-CHECKLIST.md
Shall I start with Step 1?
```

## Step-done message (template)

```
Step <n> done: <name>.

What changed: <plain words, e.g. "French and German pages now tell Google about each other">
Proof: <e.g. "checked 40 pages, 0 errors (before: 12)" or a before/after example>
Anything unexpected: <none / what and what it means>
Good to know: <one teaching line>

Next is Step <n+1>: <name> - <one line what and why>. Shall I go ahead?
```

## Analogy bank (use these, keep them consistent)

| Concept | Plain explanation and analogy |
|---|---|
| i18n / localization | Making the site speak several languages properly. Not just swapping words, but dates, prices and layout too |
| One URL per language | **Separate shelves in a library.** The French books go on the French shelf (`/fr/`), so a visitor or Google can walk straight to them |
| Server-rendered HTML (SSR/SSG) vs client-side | **A printed menu vs a waiter who reads it out only to people who ask.** Google and AI tools pick up the printed menu. Many never ask the waiter, so text added later by code is invisible to them |
| hreflang | **Signposts on each page saying "this page also exists in French, German..."** Every page must point to all its siblings, and each sibling must point back, or Google ignores the signs |
| x-default | The **"start here" sign** for visitors whose language we don't have |
| Canonical | **The official copy stamp.** Each page says "I am the original of myself". A French page must never say "the English page is my original", or Google drops the French one |
| Sitemap | **The table of contents we hand to Google**, listing every page in every language |
| lastmod | **The "last updated" date on a document.** If every page claims it changed today, Google stops trusting the dates |
| Forced redirect by language or country | **A receptionist who sends people to another floor based on their accent,** even when they asked for this floor. Google arrives with no accent from the US, so it can get stuck. Better: a polite sign saying "this page is also in German" |
| Fallback / untranslated page | **Don't put an English book on the French shelf with a French cover.** If a page isn't translated yet, it simply isn't on the French shelf |
| Source language as single source of truth | **The master recipe.** Every translation is cooked from the English recipe. Change the master, and the translations get updated from it, never the other way round |
| Message files (UI strings) | **The labels on the buttons and signs of a building,** kept in one list per language so they can be swapped |
| Hardcoded text | **A sign painted straight onto the wall** instead of a swappable plaque. It stays English in every language until someone repaints it |
| Glossary / never-translate list | **Names on a passport.** "FlytBase" and "DJI" are names, so they are never translated, the same way "Pierre" doesn't become "Peter" |
| Native-script brand spelling | **Writing a name in the local alphabet on a business card** (フライトベース). Only when the brand owner has approved that exact spelling |
| Placeholders `{name}` | **Blanks on a form** that get filled in later. Translators must keep the blanks exactly where they are |
| Plurals (ICU) | Languages count differently. Russian has several forms for "1 / 2 / 5 items", so the sentence carries all the forms and the site picks the right one |
| Cheap model tiers | **A fast junior translator for short labels, a senior one for long articles,** and an inspector who checks every piece before it goes on the shelf |
| Validation scripts | **The quality inspector with a checklist**: names intact, blanks intact, nothing missing. Anything that fails goes back for a redo |
| Stale translation | **A translation of last month's recipe.** The English changed, so the French needs a refresh. We track this automatically |
| Webhook / fan-out on publish | **A doorbell.** When an editor publishes in English, the bell rings and the translations get made automatically |
| Drift report | **A weekly stock-take** that finds pages missing from some shelves, in case a doorbell ring was missed |
| ISR / revalidation | **A bakery restocking the shelf** when a new batch is ready, instead of baking every loaf at opening time |
| CI checks | **A smoke alarm** that goes off before a broken change reaches the live site |
| Redirect (301/308) | **A forwarding address** when a page moves, so old links and Google's memory still arrive at the right door |
| RTL (Arabic, Hebrew) | **The book opens from the other side.** The whole layout mirrors, not just the text |
| Text expansion | **German needs a bigger suitcase.** The same message can be 30% longer, or 3x longer for short labels, so buttons and menus need room |

## Teaching moments ("Good to know" lines)

Use one per step, matched to what just happened:

- "Google decides what's on a page by reading the visible text, not by the
  language label, so the words themselves must be translated."
- "AI assistants like ChatGPT and Claude read your pages without running
  code. If a translation only appears after code runs, they never see it."
- "A broken translation is worse than no translation. Google may show the
  wrong page to the wrong country."
- "Brand names are like people's names: keep them identical everywhere, so
  people and search engines recognise you in every language."
- "Machine translation is a first draft. For your most important markets,
  have a native speaker check titles, buttons and legal text."
- "Changing a page address without a forwarding address loses the Google
  ranking that page earned."

## What not to do

- Don't ask a non-technical person to choose between implementation details
  ("middleware vs proxy"). Decide those yourself and mention them only if
  they carry risk.
- Ask them about **business** decisions: which languages, which markets
  matter most, who reviews translations, brand spellings, budget.
- Don't hide bad news in jargon. If the French site has been invisible to
  Google, say so plainly, with what you'll do about it.
