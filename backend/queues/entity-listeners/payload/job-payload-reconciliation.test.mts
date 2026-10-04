import { describe, expect, it } from 'vitest'
import { parseReconciliationDispatch } from './job-payload-reconciliation.mts'

describe('reconciliation continuation contract', () => {
  const window = { start: '2026-07-01T00:00:00.000Z', end: '2026-07-01T01:00:00.000Z' }
  it('accepts roots and preserves a fixed window', () => {
    expect(parseReconciliationDispatch(null)).toEqual({})
    expect(parseReconciliationDispatch({})).toEqual({})
    expect(parseReconciliationDispatch({ window })).toEqual({ window })
    const after = {
      entityType: 'topic',
      entityId: 'synthetic-topic',
      changedAtEpochUs: '1782864000000001',
    }
    expect(parseReconciliationDispatch({ window, after })).toEqual({ window, after })
  })
  it.each([
    [],
    { unexpected: true },
    { window: {} },
    { window: { ...window, extra: true } },
    { window: { ...window, start: 'invalid' } },
    { window: { ...window, end: window.start, start: window.end } },
    { after: {} },
    { window, after: {} },
  ])('rejects malformed fixed-window continuations', data => {
    expect(() => parseReconciliationDispatch(data)).toThrow(/Invalid entity listener payload/)
  })
})
