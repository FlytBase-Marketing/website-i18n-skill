# Codex profiles for the website-i18n skill

Codex reads the same agent instructions as Claude Code. The prompt points it at
the Markdown files in `plugins/website-i18n/agents/`. Profiles only pin the model and sandbox.

```bash
cp codex/*.config.toml ~/.codex/

# Audit (read-only by instruction): writes I18N-CHECKLIST.md only
codex exec -p i18n-auditor "Follow the instructions in <pkg>/plugins/website-i18n/agents/i18n-auditor.md (ignore its YAML frontmatter). Project root: $(pwd). Skill path: <pkg>/plugins/website-i18n/skills/website-i18n. Base URL: https://example.com"

# Translate one job (cheap tier), one process per job, run in parallel
for j in .i18n/jobs/*.json; do
  codex exec -p i18n-translator "Follow <pkg>/plugins/website-i18n/agents/i18n-translator.md (ignore its YAML frontmatter). Job file: $j" &
done; wait

# Long-form or retries
codex exec -p i18n-longform "Follow <pkg>/plugins/website-i18n/agents/i18n-translator.md (ignore its YAML frontmatter). Job file: .i18n/jobs/fr.007.json"
```

Model names (`gpt-6-luna`, `gpt-6.1-sol`) match this machine's Codex model list
as of 2026-10. Check `~/.codex/models_cache.json` and update the profiles when
the lineup changes. `-p <name>` layers `~/.codex/<name>.config.toml` over the
base config.
