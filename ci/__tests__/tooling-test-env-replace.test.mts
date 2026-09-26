import { describe, expect, it } from 'vitest'

import { replaceEnvInPlace } from '../tooling-test-env.mts'

describe('replaceEnvInPlace', () => {
  it('deletes missing or undefined names while retaining the process environment object', () => {
    const target: NodeJS.ProcessEnv = { DROP: 'gone', KEEP: 'old', UNSET: 'gone' }
    replaceEnvInPlace({ ADD: 'added', KEEP: 'new', UNSET: undefined }, target)
    expect(target).toEqual({ ADD: 'added', KEEP: 'new' })

    const liveEnv = process.env
    const original = { ...process.env }
    try {
      replaceEnvInPlace({ ...original, TOOLING_ENV_FRESH: 'fresh' })
      expect(process.env).toBe(liveEnv)
      expect(process.env.TOOLING_ENV_FRESH).toBe('fresh')
    } finally {
      replaceEnvInPlace(original)
    }
  })
})
