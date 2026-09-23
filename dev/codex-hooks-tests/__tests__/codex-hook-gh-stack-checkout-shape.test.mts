import { rmSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'
import type { StackCheckoutResolver } from '../../codex-hooks/policy/github-stack-checkout.mts'
import { makeTestTempDirSync } from '../test-temp-root.mts'

const IN_SYNC_STACK = {
  number: 7,
  pull_requests: [
    {
      head: { ref: 'layer-1', sha: '0'.repeat(40) },
      merged_at: null,
      number: 101,
      state: 'open',
    },
  ],
}

function withDirs(test: (dirs: { session: string; target: string }) => void): void {
  const session = makeTestTempDirSync('stack-checkout-session-')
  const target = makeTestTempDirSync('stack-checkout-target-')
  try {
    test({ session, target })
  } finally {
    rmSync(session, { force: true, recursive: true })
    rmSync(target, { force: true, recursive: true })
  }
}

function checkout(command: string, cwd: string) {
  const resolveStackForCheckout = vi.fn<StackCheckoutResolver>(() => IN_SYNC_STACK)
  const block = findPreToolUseBlock({ tool_input: { command, cwd } }, { resolveStackForCheckout })
  return { block, resolveStackForCheckout }
}

describe('Codex hook gh stack checkout command shape', () => {
  it.each([
    [(target: string) => `cd ${target} && gh stack checkout 7`, 'target'],
    [(target: string) => `cd "${target}" && gh-stack checkout 7`, 'target'],
    [() => 'gh stack checkout 7\n', 'session'],
    [() => 'gh stack \\\n  checkout 7', 'session'],
  ] as const)('resolves the checkout in the directory it runs in: %s', (build, where) => {
    withDirs(dirs => {
      const { resolveStackForCheckout } = checkout(build(dirs.target), dirs.session)
      expect(resolveStackForCheckout).toHaveBeenCalledWith(
        dirs[where],
        expect.any(Object),
        7,
        expect.any(Number),
      )
    })
  })

  it.each([
    'cd "$STACK_DIR" && gh stack checkout 7',
    'cd relative-dir && gh stack checkout 7',
    'cd TARGET; gh stack checkout 7',
    'cd TARGET && cd .. && gh stack checkout 7',
    'pushd TARGET && gh stack checkout 7',
    'builtin cd TARGET && gh stack checkout 7',
    "bash -c 'gh stack checkout 7'",
    "bash <<'EOF'\ngh stack checkout 7\nEOF",
    'echo "$(gh stack checkout 7)"',
    '(gh stack checkout 7)',
    'env --chdir=TARGET gh stack checkout 7',
    'GIT_DIR=TARGET/.git gh stack checkout 7',
    'export GIT_DIR=TARGET/.git; gh stack checkout 7',
    'git branch -f layer-1 main && gh stack checkout 7',
    'git branch -f layer-1 main\ngh stack checkout 7',
    'gh stack checkout 7 && git push',
    'gh stack checkout 7 2>&1',
    'gh stack checkout 7 &',
    'gh extension exec stack checkout 7',
    '/usr/local/bin/gh stack checkout 7',
  ])('blocks a checkout that shares its command with anything else: %s', command => {
    withDirs(({ session, target }) => {
      const { block, resolveStackForCheckout } = checkout(
        command.replaceAll('TARGET', target),
        session,
      )
      expect(block?.reason).toContain('Run gh stack checkout as the whole command')
      expect(resolveStackForCheckout).not.toHaveBeenCalled()
    })
  })
})
