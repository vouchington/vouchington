import { describe, expect, it } from 'vitest'
import { SSE_CYCLE_EXPIRED } from './index.mts'

describe('SSE_CYCLE_EXPIRED', () => {
  it('keeps the wire value shared by API SSE cycles and worker job signals', () => {
    expect(SSE_CYCLE_EXPIRED).toBe('sse-cycle-expired')
  })
})
