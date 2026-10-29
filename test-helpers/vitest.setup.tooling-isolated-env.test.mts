import { describe, expect, it } from 'vitest'

import { WORKTREE_RESOURCE_ENV_NAMES } from '../ci/db-env-names.mts'

describe('tooling isolated env setup', () => {
  it('still strips worktree resource variables and silences BASH_ENV', () => {
    expect(process.env.BASH_ENV).toBe('/dev/null')
    for (const name of WORKTREE_RESOURCE_ENV_NAMES) {
      expect(name in process.env).toBe(false)
    }
  })
})
