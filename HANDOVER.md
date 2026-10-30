# Handover: website-i18n

This repo holds an AI assistant setup that makes a website work in several
languages. You run it inside **Claude Code** or **Codex**, from the website's
code folder. Think of it as a careful contractor: it walks through the house
first, writes up what it found, and then does one job at a time, each only
after you say yes.

## What it does

1. **Audits the site** and writes `I18N-CHECKLIST.md`, a list of what is
   ready, what is missing and what is risky. During the audit it reads only
   and changes nothing.
2. **Explains the results in plain words** and proposes a numbered plan.
3. **Waits for your approval**, then does one step per approval. After each
   step it tells you what changed, how it checked the change, and one thing
   worth learning.
4. **Translates with cheaper AI models** (Haiku in Claude, `gpt-6-luna` in
   Codex). It checks every translation by script before keeping it.
5. **Sets up the search engine plumbing:** pages rendered on the server, one
   URL per language, hreflang tags, canonicals and per-language sitemaps.

**Brand and product names are never translated.** FlytBase, DJI, DJI Dock 3
and similar names stay exactly as written. A name may appear in another
script (for example Japanese katakana) only when that exact spelling is
approved in the project's `i18n/glossary.json`.

## One-time setup (about 5 minutes)

You need:

- **Claude Code** (or Codex), signed in with access to the Haiku and Sonnet
  models.
- **Node.js 18 or newer.** Check with `node --version`.
- **Access to this GitHub repo.** Ask the repo owner to add you.

Then, once per computer:

```bash
gh auth login        # sign in to GitHub
gh auth setup-git    # lets Claude Code download private repos
```

**Install in Claude Code.** Type this inside a Claude Code session:

```
/plugin install website-i18n --marketplace FlytBase-Marketing/website-i18n-skill
```

**Install in Codex.** Run this in a terminal:

```bash
git clone https://github.com/FlytBase-Marketing/website-i18n-skill.git
cd website-i18n-skill && ./install.sh --codex
```

Restart Claude Code or Codex after installing.

## First run

1. Open the **website's** code folder in Claude Code. Do not open this repo.
2. Say what you want, for example:
   > Make this site i18n-ready for French, German and Japanese. The live site
   > is https://example.com
3. Wait for the audit summary. It ends with "Audit complete. No changes made.
   Awaiting approval of the plan."
4. Read the plan. Approve all of it, part of it, or ask questions. Nothing
   happens until you answer.

**Tips**

- Ask "why?" whenever something is unclear. Explaining is part of its job.
- Approving step 3 does not approve step 4. It will ask again.
- It never commits or pushes code unless you tell it to in that message.

## Getting updates

When this repo is updated, get the new version with:

```
/plugin marketplace update flytbase-website-i18n
```

To update automatically instead, open `/plugin`, go to **Marketplaces**,
choose `flytbase-website-i18n` and select **Enable auto-update**.

For Codex, run `git pull` in your clone.

## Changing the skill

| To change | Edit |
|---|---|
| Workflow, rules, approval gates | `plugins/website-i18n/skills/website-i18n/SKILL.md` |
| How the agent talks, its analogies | `.../references/10-working-with-operators.md` |
| What gets translated or not | `.../references/09-what-to-translate.md` |
| Auditor or translator behaviour | `plugins/website-i18n/agents/*.md` |
| Codex models | `codex/*.config.toml` |

Make changes on a branch and open a pull request. Before merging, run
`claude plugin validate .` from the repo root.

## Known gaps

- **Automatic translation in GitHub Actions** is not finished. The workflow
  template (`templates/github-workflow-i18n.yml`) needs a small script that
  calls the model API, plus an API key stored as a repo secret. Until then,
  translate through the agent in Claude Code or Codex, which works today.
- **Model names change.** If Haiku, Sonnet or the Codex models are renamed,
  update the `model:` lines in `plugins/website-i18n/agents/*.md` and
  `codex/*.config.toml`.
- **Some notes name FlytBase.** `references/08-lessons-learned.md` uses
  examples from the FlytBase site. That is fine inside FlytBase. Remove them
  before sharing outside the company.
