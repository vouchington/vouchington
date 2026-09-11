import { describe, expect, it } from 'vitest'
import { parseAnalyticsBackend } from './config.mts'

describe('parseAnalyticsBackend', () => {
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
