import { describe, expect, it } from 'vitest'
import {
  classifyIntegrityReconciliation,
  hasNewIntegrityPenalty,
  isResolvedIntegrityFlag,
  isRevokedIntegrityPenalty,
  reconcileIntegrityExactRead,
} from './integrity-reconciliation'

describe('integrity reconciliation predicates', () => {
  it('recognizes resolved flags and revoked penalties from server records', () => {
    expect(isResolvedIntegrityFlag({ resolved_at: '2026-01-01T00:00:00Z' })).toBe(true)
    expect(isResolvedIntegrityFlag({ resolved_at: null })).toBe(false)
    expect(isRevokedIntegrityPenalty({ revoked_at: '2026-01-01T00:00:00Z' })).toBe(true)
    expect(isRevokedIntegrityPenalty({ revoked_at: null })).toBe(false)
  })

  it('detects a newly committed vote penalty without treating the baseline as new', () => {
    expect(hasNewIntegrityPenalty(new Set(['old']), new Set(['old', 'new']))).toBe(true)
    expect(hasNewIntegrityPenalty(new Set(['old']), new Set(['old']))).toBe(false)
  })

  it('classifies failed exact reads as unknown and unchanged reads as pending', () => {
    expect(
      classifyIntegrityReconciliation({ exactReadSucceeded: false, mutationConfirmed: true }),
    ).toBe('unknown')
    expect(
      classifyIntegrityReconciliation({ exactReadSucceeded: true, mutationConfirmed: false }),
    ).toBe('pending')
    expect(
      classifyIntegrityReconciliation({ exactReadSucceeded: true, mutationConfirmed: true }),
    ).toBe('committed')
  })

  it('uses the exact-read state to distinguish committed, pending, and unavailable mutations', async () => {
    await expect(
      reconcileIntegrityExactRead({
        getExactState: async () => ({ applied: true }),
        mutationConfirmed: state => state.applied,
      }),
    ).resolves.toMatchObject({ status: 'committed', state: { applied: true } })
    await expect(
      reconcileIntegrityExactRead({
        getExactState: async () => ({ applied: false }),
        mutationConfirmed: state => state.applied,
      }),
    ).resolves.toEqual({ status: 'pending', state: { applied: false } })
    await expect(
      reconcileIntegrityExactRead({
        getExactState: async () => {
          throw new Error('GET unavailable')
        },
        mutationConfirmed: () => true,
      }),
    ).resolves.toEqual({ status: 'unknown' })
  })
})
