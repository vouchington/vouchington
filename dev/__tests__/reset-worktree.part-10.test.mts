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

  it('skips teardown when the worktree was never initialized', { timeout: 30_000 }, async () => {
    const cwd = await makeRepo({ withEnv: false, withValkeyPort: false })
    const binDir = await makeFakeBin()
    const result = await runResetWorktree({ binDir, cwd })
    expectResetSuccess(result)
    expect(result.stdout).toContain('never initialized')
    expect(result.log).not.toContain('dropdb')
    expect(result.log).not.toContain('docker rm')
  })
})
