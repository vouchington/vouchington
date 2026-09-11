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
    'tears down DB and Valkey when initialized (.valkey-port present)',
    { timeout: 30_000 },
    async () => {
      const cwd = await makeRepo()
      const binDir = await makeFakeBin()
      const result = await runResetWorktree({ binDir, cwd })
      expectResetSuccess(result)
      expect(result.log).toContain('docker rm -f voucha-valkey-test')
      expect(result.log).toContain('dropdb voucha-test')
    },
  )
})
