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
    'skips teardown when .valkey-port is absent but .env exists',
    { timeout: 30_000 },
    async () => {
      const cwd = await makeRepo({ withValkeyPort: false })
      const binDir = await makeFakeBin()
      const result = await runResetWorktree({ binDir, cwd })
      expectResetSuccess(result)
      expect(result.stdout).toContain('already torn down')
      expect(result.log).not.toContain('dropdb')
      expect(result.log).not.toContain('docker rm')
    },
  )
})
