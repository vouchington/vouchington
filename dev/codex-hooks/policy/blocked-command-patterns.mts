import type { PatternRule } from 'vouchington-tooling/command-policy'

export const blockedHookBypassPatterns: readonly PatternRule[] = [
  {
    pattern: /\bHUSKY\s*=\s*0\b/,
    reason: 'HUSKY=0 disables husky git hooks. Fix the underlying check failure instead.',
  },
]

const DEV_SERVER_REASON =
  "Don't start dev servers manually. Run `./dev/initialize web` then `./dev/tmux` — it starts nextjs/backend/workers/cloudflare in managed panes. Manual `wrangler dev` / `next dev` / `pnpm … run dev` cause port conflicts and ECONNREFUSED. See .agents/skills/local-site-testing/SKILL.md."

export const blockedDevServerPatterns: readonly PatternRule[] = [
  {
    // Allow the prebuilt automation form of wrangler with a positional bundle and --no-bundle.
    pattern:
      /((?:^|[;&|(\n]+)\s*(?:\S+=\S+\s+)*(?:env\s+(?:\S+=\S+\s+)*)?(?:wrangler)\s+dev\b(?!\s+[^-\s]\S*(?:\s+\S+)*\s--no-bundle\b)|(?:^|[;&|(\n]+)\s*(?:\S+=\S+\s+)*(?:env\s+(?:\S+=\S+\s+)*)?(?:next)\s+dev\b|(?:^|[;&|(\n]+)\s*(?:\S+=\S+\s+)*(?:env\s+(?:\S+=\S+\s+)*)?\bnpx\b(?:\s+-+y(?:es)?)?\s+(?:wrangler|next)(?:@\S+)?\s+dev\b)/,
    reason: DEV_SERVER_REASON,
  },
  {
    pattern:
      /(?:^|[;&|(\n]+)\s*(?:\S+=\S+\s+)*\bpnpm\b(?:\s+-{1,2}[a-zA-Z][a-zA-Z0-9-]*(?:=\S+|\s+\S+)?)*\s+(?:(?:run\s+)?(?<![-:])dev(?::[A-Za-z0-9-]+)?(?![/\w-])(?![ \t]+[a-zA-Z0-9_])\b|exec\s+(?:next|wrangler)(?:@\S+)?\s+dev\b)/,
    reason: DEV_SERVER_REASON,
  },
]
