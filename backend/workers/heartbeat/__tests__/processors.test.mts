import { describe, expect, it } from 'vitest'
import { processHeartbeat } from '../processors.mts'

describe('processHeartbeat', () => {
  it('returns data with processedAt timestamp', () => {
    const before = Date.now()
    const result = processHeartbeat({ id: 'test-1', enqueuedAt: 100 })
    const after = Date.now()
    expect(result.id).toBe('test-1')
    expect(result.enqueuedAt).toBe(100)
    expect(result.processedAt).toBeGreaterThanOrEqual(before)
    expect(result.processedAt).toBeLessThanOrEqual(after)
  })

  it('handles empty data', () => {
    const result = processHeartbeat({})
    expect(result.processedAt).toBeGreaterThan(0)
  })
})
