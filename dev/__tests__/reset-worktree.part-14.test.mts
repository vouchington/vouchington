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

  it('skips tmux rename when not inside tmux', { timeout: 30_000 }, async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const result = await runResetWorktree({ binDir, cwd, env: { TMUX_PANE: '' } })
    expectResetSuccess(result)
    expect(result.log).not.toContain('tmux rename-window')
    expect(result.log).not.toContain('tmux select-pane')
  })
})
