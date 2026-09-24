import { describe, expect, it } from 'vitest'

import { replaceEnvInPlace } from '../coverage-suite-env.mts'

describe('replaceEnvInPlace', () => {
  it('deletes names absent from the next environment and assigns the rest', () => {
    const target: NodeJS.ProcessEnv = { KEEP: 'old', DROP: 'gone' }

    replaceEnvInPlace({ KEEP: 'new', ADD: 'added' }, target)

    expect(target).toEqual({ KEEP: 'new', ADD: 'added' })
    expect('DROP' in target).toBe(false)
  })

  it('treats an undefined next value as unset', () => {
    const target: NodeJS.ProcessEnv = { UNSET: 'gone', KEEP: 'kept' }

    replaceEnvInPlace({ UNSET: undefined, KEEP: 'kept' }, target)

    expect('UNSET' in target).toBe(false)
    expect(target.KEEP).toBe('kept')
  })

  it('mutates process.env in place by default without stringifying undefined', () => {
    const liveEnv = process.env
    const original = { ...process.env }
    process.env.VOUCHA_REPLACE_ENV_STALE = 'stale'

    try {
      replaceEnvInPlace({
        ...original,
        VOUCHA_REPLACE_ENV_FRESH: 'fresh',
        VOUCHA_REPLACE_ENV_UNDEFINED: undefined,
      })

      expect(process.env).toBe(liveEnv)
      expect('VOUCHA_REPLACE_ENV_STALE' in process.env).toBe(false)
      expect(process.env.VOUCHA_REPLACE_ENV_FRESH).toBe('fresh')
      expect('VOUCHA_REPLACE_ENV_UNDEFINED' in process.env).toBe(false)
    } finally {
      replaceEnvInPlace(original)
    }

    expect(process.env).toBe(liveEnv)
    expect('VOUCHA_REPLACE_ENV_FRESH' in process.env).toBe(false)
  })
})
