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

  it(
    'creates a new reset branch and hard-resets it to origin/main',
    { timeout: 30_000 },
    async () => {
      const cwd = await makeRepo()
      const binDir = await makeFakeBin()
      const result = await runResetWorktree({ binDir, cwd })
      expectResetSuccess(result)
      expect(result.log).toMatch(/git checkout -B reset-[0-9a-f]{8}/)
      expect(result.log).toContain('git reset --hard origin/main')
    },
  )
})
