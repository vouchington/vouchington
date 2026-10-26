// The package handles normalization, patch headers, shell redirections, and payload traversal.
// This repository owns only the files that autonomous agents may not change mid-session.
export const PROTECTED_HOOK_DIR_PREFIXES = [
  'dev/codex-hooks/',
  'dev/agent-policy/',
  'dev/pr-description/',
  '.codex/rules/',
  '.grok/hooks/',
]

export const PROTECTED_HOOK_EXACT_FILES = [
  'dev/agent-policy.mts',
  '.codex/config.toml',
  '.cursor/cli.json',
  '.cursor/hooks.json',
  '.cursor/permissions.json',
  '.cursor/sandbox.json',
  '.cursor/worktrees.json',
]
