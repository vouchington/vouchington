import { describe, expect, it } from 'vitest'
import { decideHuskyRun, HUSKY_HOOKS_PATH } from './prepare-husky-worktree.mts'

const primary = { gitDir: '/repo/.git', commonDir: '/repo/.git' }
const linked = { gitDir: '/repo/.git/worktrees/wt', commonDir: '/repo/.git' }

describe('decideHuskyRun', () => {
  it('runs husky in the primary checkout', () => {
    expect(decideHuskyRun({ ...primary, hooksPath: null })).toEqual({ run: true })
  })

  it('runs husky when git metadata is unavailable', () => {
    expect(decideHuskyRun({ gitDir: null, commonDir: null, hooksPath: null })).toEqual({
      run: true,
    })
  })

  it('skips with an already-configured message in a linked worktree', () => {
    const decision = decideHuskyRun({ ...linked, hooksPath: HUSKY_HOOKS_PATH })
    expect(decision).toEqual({ run: false, message: expect.stringContaining('already') })
  })

  it.each([null, '.git/hooks'])('asks for the primary checkout when hooksPath is %s', hooksPath => {
    const decision = decideHuskyRun({ ...linked, hooksPath })
    expect(decision).toEqual({ run: false, message: expect.stringContaining('primary checkout') })
  })
})
