import { describe, expect, it } from 'vitest'
import { parseEntityJob } from './job-payload.mts'
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
  it('carries the created-in-window flag on candidates and the resume cursor', () => {
    const candidate = {
      entityType: 'user',
      entityId: 'synthetic-user',
      changedAtEpochUs: '1782864000000001',
      referrerId: 'synthetic-referrer',
      createdInWindow: true,
    }
    expect(parseEntityJob('reconcileEntity', candidate).data).toEqual(candidate)
    expect(parseReconciliationDispatch({ window, after: candidate })).toEqual({
      window,
      after: candidate,
    })
    expect(() =>
      parseEntityJob('reconcileEntity', { ...candidate, createdInWindow: 'yes' }),
    ).toThrow(/createdInWindow must be a boolean/)
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
