import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanupResetWorktreeTestDirs,
  makeFakeBin,
  makeRepo,
  runResetWorktree,
} from '../test-helpers/reset-worktree.mts'

describe('reset-worktree', () => {
  afterEach(cleanupResetWorktreeTestDirs)

  it('hard-resets the reset branch when --force is given', { timeout: 30_000 }, async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin({ gitDirty: true })
    const { log } = await runResetWorktree({ args: ['--force'], binDir, cwd })
    expect(log).toMatch(/git checkout -B reset-[0-9a-f]{8} --force/)
    expect(log).toContain('git reset --hard origin/main')
  })
})
