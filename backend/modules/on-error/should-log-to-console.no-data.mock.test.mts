import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('@sentry/node')>(import('@sentry/node'), () => ({
  init: vi.fn<(typeof import('@sentry/node'))['init']>(),
}))

describe('shouldLogToConsole', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('CI', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it.each(['', 'https://public@example.test/123'])(
    'stays quiet in test with DSN %s, including CI',
    async dsn => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('SENTRY_DSN', dsn)
      vi.stubEnv('CI', 'true')
      const { shouldLogToConsole } = await import('./should-log-to-console.mts')
      expect(shouldLogToConsole()).toBe(false)
    },
  )

  it.each(['development', undefined])('logs in %s without CI', async environment => {
    vi.stubEnv('NODE_ENV', environment)
    vi.stubEnv('SENTRY_DSN', 'https://public@example.test/123')
    const { shouldLogToConsole } = await import('./should-log-to-console.mts')
    expect(shouldLogToConsole()).toBe(true)
  })

  it.each(['staging', 'production'])(
    'logs in deployed %s with a missing or invalid DSN',
    async environment => {
      vi.stubEnv('NODE_ENV', environment)
      vi.stubEnv('ENVIRONMENT', environment)
      for (const dsn of ['', 'not-a-dsn']) {
        vi.resetModules()
        vi.stubEnv('SENTRY_DSN', dsn)
        const { shouldLogToConsole } = await import('./should-log-to-console.mts')
        expect(shouldLogToConsole()).toBe(true)
      }
    },
  )

  it.each(['staging', 'production'])(
    'keeps deployed %s quiet with enabled Sentry unless CI is set',
    async environment => {
      vi.stubEnv('NODE_ENV', environment)
      vi.stubEnv('ENVIRONMENT', environment)
      vi.stubEnv('SENTRY_DSN', 'https://public@example.test/123')
      const { shouldLogToConsole } = await import('./should-log-to-console.mts')
      expect(shouldLogToConsole()).toBe(false)
      vi.stubEnv('CI', 'true')
      expect(shouldLogToConsole()).toBe(true)
    },
  )
})
