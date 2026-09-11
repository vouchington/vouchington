import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanupResetWorktreeTestDirs,
  makeFakeBin,
  makeRepo,
  registerTestDir,
  runResetWorktree,
} from '../test-helpers/reset-worktree.mts'

describe('reset-worktree', () => {
  afterEach(cleanupResetWorktreeTestDirs)

  it('refuses to run on the main worktree', { timeout: 30_000 }, async () => {
    const isolatedTmp = await mkdtemp(join(tmpdir(), 'voucha-isolated-tmp-'))
    registerTestDir(isolatedTmp)
    const cwd = await makeRepo({ isMainWorktree: true })
    const binDir = await makeFakeBin()
    const { exitCode, stderr } = await runResetWorktree({
      binDir,
      cwd,
      env: { TMPDIR: isolatedTmp },
    })
    expect(exitCode).toBe(1)
    expect(stderr).toContain('refuses to run on the main worktree')
  })
})
