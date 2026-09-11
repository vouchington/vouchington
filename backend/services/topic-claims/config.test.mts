import { describe, it, expect } from 'vitest'
import { getTopicClaimState } from './config.mts'

describe('getTopicClaimState', () => {
  it('returns pending when no date fields are set', () => {
    expect(getTopicClaimState({ verified_at: null, rejected_at: null, revoked_at: null })).toBe(
      'pending',
    )
  })

  it('returns verified when verified_at is set and revoked_at is null', () => {
    expect(
      getTopicClaimState({ verified_at: new Date(), rejected_at: null, revoked_at: null }),
    ).toBe('verified')
  })

  it('returns rejected when rejected_at is set', () => {
    expect(
      getTopicClaimState({ verified_at: null, rejected_at: new Date(), revoked_at: null }),
    ).toBe('rejected')
  })

  it('returns revoked when revoked_at is set (takes priority over verified_at)', () => {
    expect(
      getTopicClaimState({ verified_at: new Date(), rejected_at: null, revoked_at: new Date() }),
    ).toBe('revoked')
  })

  it('returns revoked over rejected when both are set', () => {
    expect(
      getTopicClaimState({ verified_at: null, rejected_at: new Date(), revoked_at: new Date() }),
    ).toBe('revoked')
  })
})
