#!/usr/bin/env bash
# Install the website-i18n skill + agents for Claude Code and/or Codex.
# Claude Code users can use the plugin instead (see HANDOVER.md); this script
# is for Codex and for Claude Code without the plugin system.
#   ./install.sh            # both, as symlinks (edits here apply everywhere)
#   ./install.sh --copy     # copy instead of symlink
#   ./install.sh --claude   # Claude Code only
#   ./install.sh --codex    # Codex only
set -euo pipefail
PKG="$(cd "$(dirname "$0")" && pwd)"
MODE=link; DO_CLAUDE=1; DO_CODEX=1
for a in "$@"; do
  case "$a" in
    --copy) MODE=copy ;;
    --claude) DO_CODEX=0 ;;
    --codex) DO_CLAUDE=0 ;;
    *) echo "unknown option $a"; exit 1 ;;
  esac
done
put() { # src dest
  mkdir -p "$(dirname "$2")"
  if [ -e "$2" ] || [ -L "$2" ]; then echo "exists, skipped: $2 (remove it first to reinstall)"; return; fi
  if [ "$MODE" = link ]; then ln -s "$1" "$2"; else cp -R "$1" "$2"; fi
  echo "installed: $2"
}
if [ "$DO_CLAUDE" = 1 ]; then
  put "$PKG/plugins/website-i18n/skills/website-i18n" "$HOME/.claude/skills/website-i18n"
  put "$PKG/plugins/website-i18n/agents/i18n-auditor.md" "$HOME/.claude/agents/i18n-auditor.md"
  put "$PKG/plugins/website-i18n/agents/i18n-translator.md" "$HOME/.claude/agents/i18n-translator.md"
fi
if [ "$DO_CODEX" = 1 ]; then
  put "$PKG/plugins/website-i18n/skills/website-i18n" "$HOME/.codex/skills/website-i18n"
  for p in i18n-auditor i18n-translator i18n-longform; do
    put "$PKG/codex/$p.config.toml" "$HOME/.codex/$p.config.toml"
  done
fi
echo "Done. Restart Claude Code / Codex so they pick up the new skill."
