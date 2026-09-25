// Each check reads one simple command: the span after `git` stops at `|`, `;`, `&`, and newline,
// so a flag on a piped or chained command (`git commit -F msg | tail -n 20`) is not a git flag.
export const blockedGitPatterns: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern:
      /\bgit\s+push\b[^|;&\n]*(?:^|[\s])(?:--force(?!-with-lease(?:\b|=))\b|-[A-Za-z]*f[A-Za-z]*\b|\+[^;&|()\s]+)/,
    reason: 'Force pushes are banned by repository policy.',
  },
  {
    pattern: /\bgit\s+commit\b[^|;&\n]*--amend\b/,
    reason: 'Commit amend is banned by repository policy.',
  },
  {
    pattern: /\bgit\s+pull\b[^|;&\n]*(?:--rebase\b|(?:^|[\s])-[A-Za-z]*r[A-Za-z]*\b)/,
    reason:
      'Use "git fetch origin && git rebase origin/main"; git pull --rebase and git pull -r are banned.',
  },
  {
    pattern:
      /\bgit\b[^|;&\n]*(?:(?:^|[\s])-X(?:=|\s)?(?:ours|theirs)\b|(?:^|[\s])-X(?:ours|theirs)\b|--strategy-option(?:=|\s+)(?:ours|theirs)\b)/,
    reason:
      'Git strategy options for ours/theirs are banned; during rebase they can silently keep the wrong side.',
  },
  {
    pattern: /\bgit\s+checkout\b[^|;&\n]*(?:--ours|--theirs)\b/,
    reason: 'git checkout --ours/--theirs is banned; resolve rebase conflicts manually.',
  },
  {
    pattern: /\bgit\b[^|;&\n]*--no-verify\b/,
    reason:
      '--no-verify bypasses repository git hooks. Fix the underlying failure instead of skipping hooks.',
  },
  {
    pattern: /\bgit\s+commit\b[^|;&\n]*(?:^|[\s])-[A-Za-z]*n[A-Za-z]*\b/,
    reason:
      'git commit -n bypasses the commit-msg and pre-commit hooks. Fix the underlying failure instead.',
  },
  {
    pattern: /\bgit\b[^|;&\n]*-c\s+core\.hooksPath\s*=/,
    reason: 'Overriding core.hooksPath disables git hooks. Fix the underlying failure instead.',
  },
]

export const blockedHookBypassPatterns: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\bHUSKY\s*=\s*0\b/,
    reason: 'HUSKY=0 disables husky git hooks. Fix the underlying check failure instead.',
  },
]

const DEV_SERVER_REASON =
  "Don't start dev servers manually. Run `./dev/initialize web` then `./dev/tmux` — it starts nextjs/backend/workers/cloudflare in managed panes. Manual `wrangler dev` / `next dev` / `pnpm … run dev` cause port conflicts and ECONNREFUSED. See .agents/skills/local-site-testing/SKILL.md."

export const blockedDevServerPatterns: Array<{ pattern: RegExp; reason: string }> = [
  {
    // wrangler/next/npx at command position (start, \n, separator, env-prefix, or npx -y/--yes).
    // Allows `rg npx next dev` (npx not at command position) and `node scripts/wrangler/dev.mts`.
    // Allows `wrangler dev dist/index.js --no-bundle` (prebuilt automation form for smoke/Playwright).
    // Requires a non-flag positional arg before --no-bundle; bare `wrangler dev --no-bundle` still blocks.
    pattern:
      /((?:^|[;&|(\n]+)\s*(?:\S+=\S+\s+)*(?:env\s+(?:\S+=\S+\s+)*)?(?:wrangler)\s+dev\b(?!\s+[^-\s]\S*(?:\s+\S+)*\s--no-bundle\b)|(?:^|[;&|(\n]+)\s*(?:\S+=\S+\s+)*(?:env\s+(?:\S+=\S+\s+)*)?(?:next)\s+dev\b|(?:^|[;&|(\n]+)\s*(?:\S+=\S+\s+)*(?:env\s+(?:\S+=\S+\s+)*)?\bnpx\b(?:\s+-+y(?:es)?)?\s+(?:wrangler|next)(?:@\S+)?\s+dev\b)/,
    reason: DEV_SERVER_REASON,
  },
  {
    // pnpm at command position (incl. env-prefix) + dev/run dev/exec next|wrangler dev.
    // Env-prefix (?:\S+=\S+\s+)* before pnpm catches FOO=1 pnpm run dev.
    // Lookahead (?![ \t]+[a-zA-Z0-9_]) prevents `pnpm --filter dev test` FP (dev is flag value).
    pattern:
      /(?:^|[;&|(\n]+)\s*(?:\S+=\S+\s+)*\bpnpm\b(?:\s+-{1,2}[a-zA-Z][a-zA-Z0-9-]*(?:=\S+|\s+\S+)?)*\s+(?:(?:run\s+)?(?<![-:])dev(?::[A-Za-z0-9-]+)?(?![/\w-])(?![ \t]+[a-zA-Z0-9_])\b|exec\s+(?:next|wrangler)(?:@\S+)?\s+dev\b)/,
    reason: DEV_SERVER_REASON,
  },
]
