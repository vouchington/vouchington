import { createHash } from 'node:crypto'
import { realpathSync, rmSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'
import type { StackCheckoutResolver } from '../../codex-hooks/policy/github-stack-checkout-resolve.mts'
import { commitOn, git, withRepo } from '../../test-helpers/stack-checkout-repo.mts'
import { makeTestTempDirSync } from '../test-temp-root.mts'

const MISSING_SHA = createHash('sha1')
  .update('synthetic PR head absent from the clone')
  .digest('hex')
const MERGED_AT = '2026-01-01T00:00:00Z'

type Layer = { pr: number; ref: string; sha: string; state?: string; mergedAt?: string | null }

function stackOf(...layers: Layer[]): Record<string, unknown> {
  return {
    number: 7,
    open: true,
    pull_requests: layers.map(({ pr, ref, sha, state = 'open', mergedAt = null }) => ({
      head: { ref, sha },
      merged_at: mergedAt,
      number: pr,
      state,
    })),
  }
}

function checkoutBlock(dir: string, command: string, ...stacks: unknown[]) {
  return findPreToolUseBlock(
    { tool_input: { command, cwd: dir } },
    { resolveStackForCheckout: () => stacks },
  )
}

describe('Codex hook gh stack checkout guard', () => {
  it('allows checkout when every existing local layer branch is at its PR head', () => {
    withRepo(({ dir, base }) => {
      const head = commitOn(dir, base, 'layer 1')
      git(dir, ['branch', 'layer-1', head])
      // layer-2 has no local branch: gh-stack creates it from the fetched remote, so it is not stale.
      const stack = stackOf(
        { pr: 101, ref: 'layer-1', sha: head },
        { pr: 102, ref: 'layer-2', sha: MISSING_SHA },
      )
      expect(checkoutBlock(dir, 'gh stack checkout 7', stack)).toBeNull()
    })
  })

  it('prints a fast-forward fetch for a layer branch behind its PR head', () => {
    withRepo(({ dir, base }) => {
      const local = commitOn(dir, base, 'layer 1')
      git(dir, ['branch', 'layer-1', local])
      const stack = stackOf({ pr: 101, ref: 'layer-1', sha: commitOn(dir, local, 'layer 1 fix') })
      expect(checkoutBlock(dir, 'gh stack checkout 7', stack)?.reason).toContain(
        '`git fetch origin refs/heads/layer-1:refs/heads/layer-1`',
      )
    })
  })

  it.each(['layer-$(true)', 'layer-`true`'])(
    'prints no shell command for a behind layer named %s',
    ref => {
      withRepo(({ dir, base }) => {
        const local = commitOn(dir, base, 'layer 1')
        git(dir, ['branch', ref, local])
        const prHead = commitOn(dir, local, 'layer 1 fix')
        const reason = checkoutBlock(
          dir,
          'gh stack checkout 7',
          stackOf({ pr: 101, ref, sha: prHead }),
        )?.reason
        expect(reason).toContain(prHead)
        expect(reason).not.toContain('git fetch origin refs/heads/')
      })
    },
  )

  it('fast-forwards a behind layer inside the worktree that has it checked out', () => {
    withRepo(({ dir, base }) => {
      const local = commitOn(dir, base, 'layer 1')
      git(dir, ['checkout', '-q', '-b', 'layer-1', local])
      const prHead = commitOn(dir, local, 'layer 1 fix')
      const reason = checkoutBlock(
        dir,
        'gh stack checkout 7',
        stackOf({ pr: 101, ref: 'layer-1', sha: prHead }),
      )?.reason
      expect(reason).toContain(`\`git merge --ff-only ${prHead}\``)
      expect(reason).toContain(realpathSync(dir))
      expect(reason).not.toContain('git fetch origin refs/heads/')
    })
  })

  it.each(['ahead', 'diverged'] as const)(
    'leaves a %s layer to the agent and prints its local head for recovery',
    shape => {
      withRepo(({ dir, base }) => {
        const shared = commitOn(dir, base, 'layer 1')
        const local = commitOn(dir, shared, 'local-only work')
        const prHead = shape === 'ahead' ? shared : commitOn(dir, shared, 'rebased elsewhere')
        git(dir, ['branch', 'layer-1', local])
        const reason = checkoutBlock(
          dir,
          'gh stack checkout 7',
          stackOf({ pr: 101, ref: 'layer-1', sha: prHead }),
        )?.reason
        expect(reason).toContain(local)
        expect(reason).not.toContain('--ff-only')
        expect(reason).not.toContain('git fetch origin refs/heads/')
      })
    },
  )

  it('asks for a fetch when the PR head is not in the clone yet', () => {
    withRepo(({ dir, base }) => {
      git(dir, ['branch', 'layer-1', commitOn(dir, base, 'layer 1')])
      const reason = checkoutBlock(
        dir,
        'gh stack checkout 7',
        stackOf({ pr: 101, ref: 'layer-1', sha: MISSING_SHA }),
      )?.reason
      expect(reason).toContain('`git fetch origin`')
      expect(reason).toContain(MISSING_SHA)
    })
  })

  it('ignores a merged layer, which gh-stack skips when rebasing, and checks a closed unmerged one', () => {
    withRepo(({ dir, base }) => {
      const local = commitOn(dir, base, 'layer 1')
      git(dir, ['branch', 'layer-1', local])
      const prHead = commitOn(dir, local, 'layer 1 fix')
      const merged = { pr: 101, ref: 'layer-1', sha: prHead, state: 'closed', mergedAt: MERGED_AT }
      expect(checkoutBlock(dir, 'gh stack checkout 7', stackOf(merged))).toBeNull()
      const closed = { ...merged, mergedAt: null }
      expect(checkoutBlock(dir, 'gh stack checkout 7', stackOf(closed))).not.toBeNull()
    })
  })

  it.each(['gh stack checkout 7', 'gh-stack checkout 7'])(
    'resolves %s against the current checkout, like gh-stack',
    command => {
      withRepo(({ dir, base }) => {
        const resolveStackForCheckout = vi.fn<StackCheckoutResolver>(() => [
          stackOf({ pr: 101, ref: 'layer-1', sha: base }),
        ])
        expect(
          findPreToolUseBlock({ tool_input: { command, cwd: dir } }, { resolveStackForCheckout }),
        ).toBeNull()
        expect(resolveStackForCheckout).toHaveBeenCalledWith(
          dir,
          expect.any(Object),
          7,
          expect.any(Number),
        )
      })
    },
  )

  it.each([
    'gh stack checkout',
    'gh stack checkout layer-1',
    'gh stack checkout 7 8',
    'gh stack checkout 0',
    'gh stack checkout 07',
    'gh stack checkout 99999999999999999999',
    'gh stack checkout --repo other-owner/other-repo 7',
    'gh stack checkout https://github.com/other-owner/other-repo/pull/7',
    'gh extension exec stack checkout',
  ])('blocks a target other than one stack number or PR number: %s', command => {
    withRepo(({ dir }) => {
      const resolveStackForCheckout = vi.fn<StackCheckoutResolver>()
      const block = findPreToolUseBlock(
        { tool_input: { command, cwd: dir } },
        { resolveStackForCheckout },
      )
      expect(block?.reason).toContain('`gh stack checkout <stack-number>`')
      expect(resolveStackForCheckout).not.toHaveBeenCalled()
    })
  })

  const layerWith = (layer: Record<string, unknown>) => ({
    head: { ref: 'l', sha: MISSING_SHA },
    merged_at: null,
    number: 1,
    ...layer,
  })
  const stackWith = (layer: Record<string, unknown>) => [
    { number: 7, pull_requests: [layerWith(layer)] },
  ]
  it.each([
    ['an unresolved target', undefined],
    ['no candidate stack', []],
    ['a stack with no layers', [{ number: 7, pull_requests: [] }]],
    ['a stack without a number', [{ pull_requests: [layerWith({})] }]],
    ['a layer without a head SHA', stackWith({ head: { ref: 'l' } })],
    ['a malformed head SHA', stackWith({ head: { ref: 'l', sha: 'abc' } })],
    ['a layer without merge state', stackWith({ merged_at: undefined })],
    ['an empty merge time', stackWith({ merged_at: '' })],
    ['a fractional PR number', stackWith({ number: 1.5 })],
    ['an empty head ref', stackWith({ head: { ref: '', sha: MISSING_SHA } })],
    ['one unreadable candidate', [...stackWith({}), { number: 9, pull_requests: [{}] }]],
  ])('fails closed on %s, since checkout itself needs the same stack read', (_label, stacks) => {
    withRepo(({ dir }) => {
      const block = findPreToolUseBlock(
        { tool_input: { command: 'gh stack checkout 7', cwd: dir } },
        { resolveStackForCheckout: () => stacks },
      )
      expect(block?.reason).toContain('could not resolve 7 to a stack')
    })
  })

  it('checks the layers of every stack the checkout could import', () => {
    withRepo(({ dir, base }) => {
      const local = commitOn(dir, base, 'layer 2')
      git(dir, ['branch', 'layer-2', local])
      const inSync = stackOf({ pr: 101, ref: 'layer-1', sha: MISSING_SHA })
      const fallback = {
        ...stackOf({ pr: 7, ref: 'layer-2', sha: commitOn(dir, local, 'layer 2 fix') }),
        number: 9,
      }
      const reason = checkoutBlock(dir, 'gh stack checkout 7', inSync, fallback)?.reason
      expect(reason).toContain('can import stack #7 or stack #9.')
      expect(reason).toContain('"layer-2" (PR #7)')
    })
  })

  it('fails closed when git cannot read the local branches in the command cwd', () => {
    const dir = makeTestTempDirSync('stack-checkout-not-a-repo-')
    try {
      const stack = stackOf({ pr: 101, ref: 'layer-1', sha: MISSING_SHA })
      expect(checkoutBlock(dir, 'gh stack checkout 7', stack)?.reason).toContain(
        'could not read the local layer branches',
      )
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('fails closed once the deadline passes before the local branches are read', () => {
    withRepo(({ dir, base }) => {
      git(dir, ['branch', 'layer-1', base])
      const now = vi.spyOn(Date, 'now')
      try {
        const reason = findPreToolUseBlock(
          { tool_input: { command: 'gh stack checkout 7', cwd: dir } },
          {
            resolveStackForCheckout: (_cwd, _env, _number, deadline) => {
              now.mockReturnValue(deadline)
              return [stackOf({ pr: 101, ref: 'layer-1', sha: base })]
            },
          },
        )?.reason
        expect(reason).toContain('could not read the local layer branches')
      } finally {
        now.mockRestore()
      }
    })
  })
})
