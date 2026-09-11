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

  it('does not run git clean -fd without --force', { timeout: 30_000 }, async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const result = await runResetWorktree({ binDir, cwd })
    expectResetSuccess(result)
    expect(result.log).not.toContain('git clean -fd')
  })
})
