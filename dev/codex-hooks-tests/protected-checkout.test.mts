import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../codex-hooks/policy.mts'
import {
  isProtectedCheckoutPath,
  protectedCheckoutPathspecFile,
  REBASE_ONTO_MAIN,
} from '../codex-hooks/policy/protected-checkout-paths.mts'

const protectedDiff = () => ['.claude/settings.json']
const emptyDiff = () => []
const unavailableDiff = () => undefined

describe('protected checkout hook', () => {
  it('blocks a raw rebase when a protected path differs', () => {
    const reason = findPreToolUseBlock(
      { tool_input: { command: 'git rebase origin/main' } },
      { protectedCheckoutDiff: protectedDiff },
    )?.reason
    expect(reason).toContain(REBASE_ONTO_MAIN)
    expect(reason).toContain('.claude/settings.json')
    expect(reason).toContain('half-updated')
  })

  it('allows a raw rebase when the injected diff is empty', () => {
    expect(
      findPreToolUseBlock(
        { tool_input: { command: 'git rebase origin/main' } },
        { protectedCheckoutDiff: emptyDiff },
      ),
    ).toBeNull()
  })

  it('allows a raw rebase when the only difference is hook code', () => {
    expect(
      findPreToolUseBlock(
        { tool_input: { command: 'git rebase origin/main' } },
        { protectedCheckoutDiff: () => ['dev/codex-hooks/policy.mts'] },
      ),
    ).toBeNull()
  })

  it('blocks a fetch and rebase chain even when the pre-fetch diff is empty', () => {
    expect(
      findPreToolUseBlock(
        { tool_input: { command: 'git fetch origin && git rebase origin/main' } },
        { protectedCheckoutDiff: emptyDiff },
      )?.reason,
    ).toContain(REBASE_ONTO_MAIN)
  })

  it('blocks when git cannot answer', () => {
    expect(
      findPreToolUseBlock(
        { tool_input: { command: 'git rebase origin/main' } },
        { protectedCheckoutDiff: unavailableDiff },
      )?.reason,
    ).toContain(REBASE_ONTO_MAIN)
  })

  it.each([
    'GIT_EDITOR=true git rebase --continue',
    'git rebase --abort',
    'git checkout -b topic',
    'git switch -c topic',
    'git checkout HEAD -- README.md',
    './dev/rebase-onto-main',
    './dev/reset-worktree --force',
  ])('does not treat %s as a protected checkout', command => {
    expect(
      findPreToolUseBlock({ tool_input: { command } }, { protectedCheckoutDiff: protectedDiff }),
    ).toBeNull()
  })

  it('blocks checkout of a protected path', () => {
    expect(
      findPreToolUseBlock(
        { tool_input: { command: 'git checkout HEAD -- .claude/settings.json' } },
        { protectedCheckoutDiff: protectedDiff },
      )?.reason,
    ).toContain('.claude/settings.json')
  })

  it('blocks reset --hard and checkout -b onto a start point when a protected path differs', () => {
    expect(
      findPreToolUseBlock(
        { tool_input: { command: 'git reset --hard origin/main' } },
        { protectedCheckoutDiff: protectedDiff },
      )?.reason,
    ).toContain('.claude/settings.json')
    expect(
      findPreToolUseBlock(
        { tool_input: { command: 'git checkout -b topic origin/main' } },
        { protectedCheckoutDiff: protectedDiff },
      )?.reason,
    ).toContain('.claude/settings.json')
  })

  it('blocks git reset origin/main --hard against the commit, not HEAD', () => {
    const seen: string[] = []
    findPreToolUseBlock(
      { tool_input: { command: 'git reset origin/main --hard' } },
      {
        protectedCheckoutDiff: (_cwd, target) => {
          seen.push(target)
          return target === 'origin/main' ? ['.claude/settings.json'] : []
        },
      },
    )
    expect(seen).toEqual(['origin/main'])
  })

  it('blocks git pull before its internal fetch can be checked', () => {
    expect(
      findPreToolUseBlock(
        { tool_input: { command: 'git pull origin main' } },
        { protectedCheckoutDiff: emptyDiff },
      )?.reason,
    ).toContain(REBASE_ONTO_MAIN)
  })

  it('blocks gh stack rebase even when origin/main matches', () => {
    expect(
      findPreToolUseBlock(
        { tool_input: { command: 'gh stack rebase' } },
        { protectedCheckoutDiff: emptyDiff },
      )?.reason,
    ).toContain(REBASE_ONTO_MAIN)
  })

  it('blocks cherry-pick, stash pop, and a whole-tree restore', () => {
    for (const command of ['git cherry-pick abc', 'git stash pop', 'git restore .']) {
      expect(
        findPreToolUseBlock({ tool_input: { command } }, { protectedCheckoutDiff: emptyDiff })
          ?.reason,
      ).toContain(REBASE_ONTO_MAIN)
    }
  })

  it('blocks gh stack rebase when a protected path differs', () => {
    expect(
      findPreToolUseBlock(
        { tool_input: { command: 'gh stack rebase' } },
        { protectedCheckoutDiff: protectedDiff },
      )?.reason,
    ).toContain(REBASE_ONTO_MAIN)
  })

  it('matches the shared pathspec file', () => {
    expect(isProtectedCheckoutPath('.claude/settings.json')).toBe(true)
    expect(isProtectedCheckoutPath('.claude/skills/agent-workflow')).toBe(true)
    expect(isProtectedCheckoutPath('.cursor/cli.json')).toBe(true)
    expect(isProtectedCheckoutPath('.claude/README.md')).toBe(false)
    expect(isProtectedCheckoutPath('dev/codex-hooks/policy.mts')).toBe(false)
    expect(isProtectedCheckoutPath('.codex/config.toml')).toBe(false)
    expect(readFileSync(protectedCheckoutPathspecFile(), 'utf8')).toContain('.claude/settings.json')
    const shell = readFileSync(join(import.meta.dirname, '../lib/protected-checkout.sh'), 'utf8')
    expect(shell).toContain('protected-checkout-paths.txt')
    expect(shell).toContain('SANDBOX_RUNTIME')
    expect(shell).toContain('CURSOR_SANDBOX')
    expect(shell).toContain(REBASE_ONTO_MAIN)
  })
})
