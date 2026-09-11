import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanupResetWorktreeTestDirs,
  makeFakeBin,
  makeRepo,
  runResetWorktree,
} from '../test-helpers/reset-worktree.mts'

describe('reset-worktree', () => {
  afterEach(cleanupResetWorktreeTestDirs)

  it(
    'proceeds with --force even when tracked files are modified',
    { timeout: 30_000 },
    async () => {
      const cwd = await makeRepo()
      const binDir = await makeFakeBin({ gitDirty: true })
      const result = await runResetWorktree({ args: ['--force'], binDir, cwd })
      expect(result).toMatchObject({ exitCode: 0 })
    },
  )
})
