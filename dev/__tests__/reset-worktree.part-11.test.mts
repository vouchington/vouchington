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
    expect(result.log.indexOf('git fetch origin main')).toBeLessThan(result.log.indexOf('dropdb'))
  })

  it(
    'leaves services and resources intact if fetching origin/main fails',
    { timeout: 30_000 },
    async () => {
      const cwd = await makeRepo()
      const binDir = await makeFakeBin({ gitFetchFails: true })
      const result = await runResetWorktree({ binDir, cwd })
      expect(result.exitCode).toBe(1)
      expect(result.log).toContain('git fetch origin main')
      expect(result.log).not.toContain('dropdb')
      expect(result.log).not.toContain('docker rm')
      expect(result.log).not.toContain('checkout')
    },
  )
})
