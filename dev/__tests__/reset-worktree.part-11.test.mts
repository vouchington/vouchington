import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanupResetWorktreeTestDirs,
  expectResetSuccess,
  makeFakeBin,
  makeRepo,
  runResetWorktree,
} from '../test-helpers/reset-worktree.mts'

describe('reset-worktree', () => {
  afterEach(cleanupResetWorktreeTestDirs)

  it('fetches origin/main', { timeout: 30_000 }, async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const result = await runResetWorktree({ binDir, cwd })
    expectResetSuccess(result)
    expect(result.log).toContain('git fetch origin main')
  })
})
