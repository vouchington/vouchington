#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook (Claude Code; Cursor and Grok via Claude-compat): reads the edited path from
# the tool payload once and runs the matching formatters and linters. Advisory: always exits 0.
# Only the oxlint report and `lint-links` findings reach the agent as context.

f="$(jq -r '.tool_input.file_path // .toolInput.file_path // .toolInput.filePath // .toolInput.path // empty' 2>/dev/null || true)"
[ -n "$f" ] || exit 0

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

rel="${f#"$repo_root"/}"

tsc_project() {
  case "$rel" in
    backend/* | email-templates/* | web/* | cloudflare-worker/* | lambdas/* | ts-shared/*)
      echo "${rel%%/*}/tsconfig.json"
      ;;
    *) echo "tsconfig.json" ;;
  esac
}

case "$f" in
  *.ts | *.tsx | *.mts | *.mjs | *.js | *.jsx)
    pnpm exec oxlint --type-aware --fix --quiet "$f" 2>/dev/null || true
    pnpm exec oxlint --type-aware "$f" 2>&1 || true
    pnpm exec oxfmt "$f" 2>/dev/null || true
    case "$f" in
      *.ts | *.tsx | *.mts)
        pnpm exec tsc --noEmit --incremental --project "$(tsc_project)" 2>/dev/null || true
        ;;
    esac
    ;;
  *.md) ./ci/lint-links.sh --offline "$rel" 2>/dev/null || true ;;
  *.rs) rustfmt "$f" 2>/dev/null || true ;;
  *.lua) selene --config selene.toml "$f" 2>/dev/null || true ;;
esac

exit 0
