import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAnalyticsFirehoseStreamName, parseAnalyticsBackend } from './config.mts'

describe('parseAnalyticsBackend', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('rejects an invalid backend while loading deployed analytics configuration', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('ANALYTICS_BACKEND', 'bogus')
    vi.resetModules()

    await expect(import('./config.mts')).rejects.toThrow(
      "ANALYTICS_BACKEND must be 'local', 'firehose', or 'disabled' — got: 'bogus'",
    )
  })
  it('uses the configured Firehose prefix for a real analytics stream', () => {
    vi.stubEnv('ANALYTICS_FIREHOSE_PREFIX', 'test-analytics-')
    expect(getAnalyticsFirehoseStreamName('web_page_view')).toBe('test-analytics-web_page_view')
  })

  it('passes through valid backend values unchanged', () => {
    expect(parseAnalyticsBackend('local')).toBe('local')
    expect(parseAnalyticsBackend('firehose')).toBe('firehose')
    expect(parseAnalyticsBackend('disabled')).toBe('disabled')
  })

  it('silently falls back to disabled for an invalid value when not deployed', () => {
    expect(parseAnalyticsBackend('bogus', false)).toBe('disabled')
  })

  it('throws for an invalid value when deployed, even though ECS sets NODE_ENV=production on staging too', () => {
    expect(() => parseAnalyticsBackend('bogus', true)).toThrow(
      "ANALYTICS_BACKEND must be 'local', 'firehose', or 'disabled' — got: 'bogus'",
    )
  })
})
