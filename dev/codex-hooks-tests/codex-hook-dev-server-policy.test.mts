import { describe, expect, it } from 'vitest'
import { findPreToolUseBlock } from '../codex-hooks/policy.mts'

function block(command: string) {
  return findPreToolUseBlock({ tool_input: { command } })
}

const DEV_SERVER_SUBSTR = 'dev server'

describe('blockedDevServerPatterns', () => {
  describe('blocks manual dev server commands', () => {
    it.each([
      // Literal incident commands from issue #6240
      'npx wrangler dev --port 64181 --inspector-port 0',
      'pnpm --dir web run dev',
      // Variants
      'wrangler dev',
      'next dev',
      'npx next dev',
      // Versioned package specs (npx wrangler@latest dev)
      'npx wrangler@latest dev',
      'npx wrangler@3 dev --port 8787',
      'npx next@latest dev',
      // pnpm short flags (-C, -F) and equals-form long flags
      'pnpm -C web run dev',
      'pnpm -F web dev',
      'pnpm --filter=web dev',
      'pnpm --filter=web run dev',
      'pnpm dev',
      'pnpm run dev',
      'pnpm run dev:cloudflare-worker',
      'cd web && pnpm run dev',
      'bash -c "pnpm --dir web run dev"',
      // Newline command separator (same as ; in shells)
      'cd web\nnext dev',
      'cd cloudflare-worker\nwrangler dev',
      // Env-prefixed invocations
      'NEXT_PORT=3000 next dev',
      'FOO=1 wrangler dev',
      'cd web && NEXT_PORT=3000 next dev',
      // Env-prefix before pnpm (FOO=1 pnpm run dev)
      'NEXT_PORT=3000 pnpm run dev',
      'FOO=1 pnpm run dev',
      'NEXT_PORT=3000 pnpm --dir web run dev',
      // pnpm dev backgrounded or chained — must block not slip through
      'pnpm run dev &',
      'pnpm run dev && echo ready',
      'pnpm --dir web run dev &',
      // pnpm with long-flag space-value and dev as the subcommand (not flag value)
      'pnpm --dir web dev',
      'pnpm --dir web dev --turbo',
      // wrangler dev --no-bundle without a bundle file still starts a dev server — must block
      'wrangler dev --no-bundle',
      'wrangler dev --port 64181 --no-bundle',
      // pnpm exec with dev-server binary
      'pnpm exec next dev',
      'pnpm exec wrangler dev',
      'pnpm --dir web exec next dev',
      'pnpm -C web exec wrangler dev',
      // env utility prefix
      'env NEXT_PORT=3000 next dev',
      'env FOO=1 wrangler dev',
      // npx with prompt-suppression flags (-y/--yes)
      'npx --yes wrangler dev',
      'npx -y next dev',
    ])('blocks: %s', command => {
      const result = block(command)
      expect(result).not.toBeNull()
      expect(result?.reason.toLowerCase()).toContain(DEV_SERVER_SUBSTR)
    })
  })

  describe('does not block safe dev commands', () => {
    it.each([
      './dev/tmux',
      './dev/tmux --verbose',
      'node scripts/wrangler/dev.mts',
      'pnpm install',
      'pnpm run build',
      'pnpm run build:dev',
      'pnpm run db:dev',
      'pnpm run test:smoke',
      'pnpm run typecheck',
      'pnpm run build-storybook',
      // dep-cruise reproduce command — `dev` is a directory arg to depcruise, not a script
      'pnpm exec depcruise --config .dependency-cruiser.cjs --output-type err ci dev static-code-analysis',
      // wrangler with `dev` as a flag value (not the subcommand) — must not block
      'wrangler --env dev deploy',
      'wrangler --config dev.toml deploy',
      // wrangler dev prebuilt automation form (smoke tests / Playwright) — must not block.
      // Bare wrangler dev --no-bundle (no file arg) is still blocked — see block cases above.
      'wrangler dev dist/index.js --no-bundle',
      // wrangler/next/npx as arguments to another tool — must not block
      'rg next dev',
      'grep wrangler dev/README.md',
      'FOO=1 rg next dev',
      'rg npx next dev',
      // pnpm --long-flag dev subcommand — `dev` is a flag value, not the script name
      'pnpm --filter dev test',
      'pnpm --filter dev lint',
      // pnpm as a search pattern argument to another tool — must not block
      'rg pnpm run dev',
      'rg --type ts pnpm run dev',
    ])('allows: %s', command => {
      const result = block(command)
      // Either no block, or a block for a different reason (not dev-server)
      expect(result?.reason.toLowerCase().includes(DEV_SERVER_SUBSTR) ?? false).toBe(false)
    })
  })
})
