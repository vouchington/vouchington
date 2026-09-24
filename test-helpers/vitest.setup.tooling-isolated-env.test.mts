import { afterEach, describe, expect, it, vi } from 'vitest'

import { WORKTREE_RESOURCE_ENV_NAMES } from '../ci/db-env-names.mts'

const PRESENT_NAME = 'VOUCHA_ENV_SETUP_PRESENT'
const ABSENT_NAME = 'VOUCHA_ENV_SETUP_ABSENT'

describe('tooling isolated env setup', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete process.env[PRESENT_NAME]
    delete process.env[ABSENT_NAME]
  })

  it('unsets a variable when it is stubbed to undefined', () => {
    process.env[PRESENT_NAME] = 'original'

    vi.stubEnv(PRESENT_NAME, undefined)

    expect(PRESENT_NAME in process.env).toBe(false)
  })

  it('restores the original value when stubs are removed', () => {
    process.env[PRESENT_NAME] = 'original'

    vi.stubEnv(PRESENT_NAME, 'stubbed')
    expect(process.env[PRESENT_NAME]).toBe('stubbed')
    vi.unstubAllEnvs()

    expect(process.env[PRESENT_NAME]).toBe('original')
  })

  it('restores a variable that was unset before it was stubbed and unstubbed', () => {
    process.env[PRESENT_NAME] = 'original'

    vi.stubEnv(PRESENT_NAME, undefined)
    vi.unstubAllEnvs()

    expect(process.env[PRESENT_NAME]).toBe('original')
  })

  it('removes a variable that did not exist before it was stubbed', () => {
    vi.stubEnv(ABSENT_NAME, 'stubbed')
    expect(process.env[ABSENT_NAME]).toBe('stubbed')
    vi.unstubAllEnvs()

    expect(ABSENT_NAME in process.env).toBe(false)
  })

  it('still strips worktree resource variables and silences BASH_ENV', () => {
    expect(process.env.BASH_ENV).toBe('/dev/null')
    for (const name of WORKTREE_RESOURCE_ENV_NAMES) {
      expect(name in process.env).toBe(false)
    }
  })
})
