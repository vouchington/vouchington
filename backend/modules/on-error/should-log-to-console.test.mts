import { afterEach, describe, expect, it, vi } from 'vitest'
import { shouldLogToConsole } from './should-log-to-console.mts'

describe('shouldLogToConsole', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('stays quiet in test, including when CI is set', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('CI', 'true')

    expect(shouldLogToConsole()).toBe(false)
  })

  it('logs in development when CI is unset', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('CI', '')

    expect(shouldLogToConsole()).toBe(true)
  })

  it('logs when NODE_ENV is unset and treats that as development', () => {
    vi.stubEnv('NODE_ENV', undefined)
    vi.stubEnv('CI', '')

    expect(shouldLogToConsole()).toBe(true)
  })

  it('stays quiet in production until CI is set', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CI', '')

    expect(shouldLogToConsole()).toBe(false)

    vi.stubEnv('CI', 'true')

    expect(shouldLogToConsole()).toBe(true)
  })
})
