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
    'runs git clean -fd before resetting to remove untracked files when --force',
    { timeout: 30_000 },
    async () => {
      const cwd = await makeRepo()
      const binDir = await makeFakeBin({ gitUntracked: '?? leftover.txt\n' })
      const result = await runResetWorktree({ args: ['--force'], binDir, cwd })
      expectResetSuccess(result)
      const { log } = result
      expect(log).toContain('git clean -fd')
      expect(log).toMatch(/git checkout -B reset-[0-9a-f]{8}/)
      expect(log).toContain('git reset --hard origin/main')
      expect(log.indexOf('git clean -fd')).toBeLessThan(log.indexOf('git reset --hard origin/main'))
    },
  )
})
