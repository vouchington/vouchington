import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanupResetWorktreeTestDirs,
  makeFakeBin,
  makeRepo,
  runResetWorktree,
} from '../test-helpers/reset-worktree.mts'

describe('reset-worktree', () => {
  afterEach(cleanupResetWorktreeTestDirs)

  it('refuses when untracked files are present', { timeout: 30_000 }, async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin({ gitUntracked: '?? foo.txt\n' })
    const { exitCode, stderr } = await runResetWorktree({ binDir, cwd })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('untracked files')
  })
})
