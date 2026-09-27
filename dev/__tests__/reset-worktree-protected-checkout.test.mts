import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupResetWorktreeTestDirs,
  makeFakeBin,
  makeRepo,
  runResetWorktree,
} from '../test-helpers/reset-worktree.mts'

describe('reset-worktree protected checkout', () => {
  afterEach(cleanupResetWorktreeTestDirs)

  it('hard-resets when the protected diff is empty', { timeout: 30_000 }, async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin({ gitDirty: true })
    const { exitCode, log } = await runResetWorktree({ args: ['--force'], binDir, cwd })
    expect(exitCode).toBe(0)
    expect(log).toContain('git reset --hard origin/main')
  })

  it('stops before reset when a sandbox marker is set and a protected path differs', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin({
      gitDirty: true,
      protectedCheckoutDiff: '.claude/settings.json',
    })
    const { exitCode, log, stderr } = await runResetWorktree({
      args: ['--force'],
      binDir,
      cwd,
      env: { SANDBOX_RUNTIME: '1' },
    })
    expect(exitCode).toBe(2)
    expect(log).not.toContain('checkout -B')
    expect(log).not.toContain('git reset --hard origin/main')
    expect(stderr).toContain('./dev/rebase-onto-main')
    expect(stderr).toContain('.claude/settings.json')
  })

  it('resets when a protected path differs and no sandbox marker is set', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin({
      gitDirty: true,
      protectedCheckoutDiff: '.claude/settings.json',
    })
    const { exitCode, log } = await runResetWorktree({ args: ['--force'], binDir, cwd })
    expect(exitCode).toBe(0)
    expect(log).toContain('git reset --hard origin/main')
  })
})
