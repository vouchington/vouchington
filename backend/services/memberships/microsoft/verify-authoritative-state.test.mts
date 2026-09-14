import { describe, expect, it, vi } from 'vitest'
import type { MicrosoftStoreVerificationResult } from './types.mts'
import { verifyMicrosoftStoreAuthoritativeState } from './verify-authoritative-state.mts'

const base = {
  applicationId: 'Voucha',
  environment: 'test' as const,
  publisherUserId: 'user-1',
  membershipProductId: 'product-1',
  productId: '9TESTPRODUCT',
  skuId: '0001',
  collection: {
    id: 'collection-1',
    recurrenceData: 'recurrence-1',
    modifiedDate: '2026-01-01T01:00:00Z',
    productId: '9TESTPRODUCT',
    skuId: '0001',
    endDate: '2099-01-02T00:00:00Z',
    status: 'Active' as const,
  },
  recurrence: {
    id: 'recurrence-1',
    productId: '9TESTPRODUCT',
    skuId: '0001',
    startTime: '2026-01-01T00:00:00Z',
    expirationTime: '2099-01-02T00:00:00Z',
    lastModified: '2026-01-01T01:00:00Z',
    recurrenceState: 'Active' as const,
    autoRenew: true,
  },
}
describe('Microsoft Store authoritative state', () => {
  it('derives lineage from recurrence and keeps the client key out of it', () => {
    expect(verifyMicrosoftStoreAuthoritativeState(base)).toMatchObject({
      accepted: true,
      observation: {
        providerLineageId: '["Voucha","9TESTPRODUCT","0001","recurrence-1"]',
        collectionItemId: 'collection-1',
        providerAccountId: null,
        autoRenews: true,
      },
    })
  })
  it('rejects product/SKU replay', () => {
    expect(
      verifyMicrosoftStoreAuthoritativeState({
        ...base,
        recurrence: { ...base.recurrence, skuId: 'other' },
      }),
    ).toEqual({ accepted: false, reasonCode: 'wrong_product' })
  })
  it('requires corroborating concrete provider SKUs when the local mapping has no SKU', () => {
    expect(
      verifyMicrosoftStoreAuthoritativeState({
        ...base,
        skuId: null,
        collection: { ...base.collection, skuId: 'provider-sku' },
        recurrence: { ...base.recurrence, skuId: 'provider-sku' },
      }),
    ).toMatchObject({
      accepted: true,
      observation: {
        providerLineageId: '["Voucha","9TESTPRODUCT","provider-sku","recurrence-1"]',
      },
    })
    expect(
      verifyMicrosoftStoreAuthoritativeState({
        ...base,
        skuId: null,
        collection: { ...base.collection, skuId: 'provider-sku-a' },
        recurrence: { ...base.recurrence, skuId: 'provider-sku-b' },
      }),
    ).toEqual({ accepted: false, reasonCode: 'wrong_product' })
  })
  it('accepts product-only evidence when neither provider record supplies a SKU', () => {
    expect(
      verifyMicrosoftStoreAuthoritativeState({
        ...base,
        skuId: null,
        collection: { ...base.collection, skuId: undefined },
        recurrence: { ...base.recurrence, skuId: undefined },
      }),
    ).toMatchObject({ accepted: true })
  })
  it('rejects unrelated collection and recurrence records', () => {
    expect(
      verifyMicrosoftStoreAuthoritativeState({
        ...base,
        recurrence: { ...base.recurrence, id: 'other-recurrence' },
      }),
    ).toEqual({ accepted: false, reasonCode: 'invalid_evidence' })
  })
  it.each([
    ['a missing collection identifier', { collection: { ...base.collection, id: undefined } }],
    ['a missing recurrence identifier', { recurrence: { ...base.recurrence, id: undefined } }],
    [
      'a missing collection revision',
      { collection: { ...base.collection, modifiedDate: undefined } },
    ],
    [
      'a malformed recurrence expiry',
      { recurrence: { ...base.recurrence, expirationTime: 'not-a-date' } },
    ],
    [
      'a malformed collection end date',
      { collection: { ...base.collection, endDate: 'not-a-date' } },
    ],
  ])('rejects %s', (_description, overrides) => {
    expect(verifyMicrosoftStoreAuthoritativeState({ ...base, ...overrides })).toEqual({
      accepted: false,
      reasonCode: 'invalid_evidence',
    })
  })
  it('does not grant before the subscription starts', () => {
    expect(
      verifyMicrosoftStoreAuthoritativeState({
        ...base,
        recurrence: {
          ...base.recurrence,
          startTime: new Date(Date.now() + 86_400_000).toISOString(),
        },
      }),
    ).toEqual({ accepted: false, reasonCode: 'invalid_evidence' })
    expect(
      verifyMicrosoftStoreAuthoritativeState({
        ...base,
        collection: {
          ...base.collection,
          startDate: new Date(Date.now() + 86_400_000).toISOString(),
        },
      }),
    ).toEqual({ accepted: false, reasonCode: 'invalid_evidence' })
  })
  it('uses the later Collections start and rejects an inconsistent provider window', () => {
    const collectionStart = new Date('2026-01-01T06:00:00Z')
    const result = verifyMicrosoftStoreAuthoritativeState({
      ...base,
      collection: { ...base.collection, startDate: collectionStart.toISOString() },
    })
    expect(acceptedObservation(result).effectiveAt).toEqual(collectionStart)
    expect(
      verifyMicrosoftStoreAuthoritativeState({
        ...base,
        collection: { ...base.collection, startDate: '2099-01-03T00:00:00Z' },
      }),
    ).toEqual({ accepted: false, reasonCode: 'invalid_evidence' })
  })
  it('terminalizes an expired recurrence even when state update is delayed', () => {
    const expiredAt = new Date(Date.now() - 86_400_000)
    const result = verifyMicrosoftStoreAuthoritativeState({
      ...base,
      collection: { ...base.collection, endDate: expiredAt.toISOString() },
      recurrence: { ...base.recurrence, expirationTime: expiredAt.toISOString() },
    })
    expect(result).toMatchObject({
      accepted: true,
      observation: { lifecycle: 'expired', terminalAt: expiredAt, expiresAt: expiredAt },
    })
  })
  it('advances the revision when an unchanged Active response crosses its expiry', () => {
    const options = {
      ...base,
      collection: { ...base.collection, endDate: '2026-09-01T00:00:00Z' },
      recurrence: { ...base.recurrence, expirationTime: '2026-09-01T00:00:00Z' },
    }
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-31T00:00:00Z'))
      const before = verifyMicrosoftStoreAuthoritativeState(options)
      vi.setSystemTime(new Date('2026-09-02T00:00:00Z'))
      const after = verifyMicrosoftStoreAuthoritativeState(options)
      expect(before).toMatchObject({ accepted: true, observation: { lifecycle: 'active' } })
      expect(after).toMatchObject({ accepted: true, observation: { lifecycle: 'expired' } })
      const beforeObservation = acceptedObservation(before)
      const afterObservation = acceptedObservation(after)
      expect(afterObservation.providerRevision).not.toBe(beforeObservation.providerRevision)
      expect(afterObservation.providerOrder).toBe(beforeObservation.providerOrder)
    } finally {
      vi.useRealTimers()
    }
  })
  it('uses Collections revocation as a new terminal revision even if Recurrence is still active', () => {
    const options = {
      ...base,
      collection: {
        ...base.collection,
        status: 'Revoked',
        endDate: '2099-01-02T00:00:00Z',
        modifiedDate: '2026-01-01T12:00:00Z',
      },
    } as const
    const result = verifyMicrosoftStoreAuthoritativeState(options)
    expect(result).toMatchObject({
      accepted: true,
      observation: {
        lifecycle: 'revoked',
        providerOrder: new Date('2026-01-01T12:00:00Z').getTime(),
      },
    })
    expect(acceptedObservation(result).terminalAt?.getTime()).toBeLessThanOrEqual(Date.now())
    const laterNow = new Date(Date.now() + 60_000)
    vi.useFakeTimers()
    try {
      vi.setSystemTime(laterNow)
      const later = acceptedObservation(verifyMicrosoftStoreAuthoritativeState(options))
      expect(later.providerOrder).toBe(acceptedObservation(result).providerOrder)
      expect(later.terminalAt).not.toEqual(acceptedObservation(result).terminalAt)
    } finally {
      vi.useRealTimers()
    }
  })
  it.each([
    ['Expired', 'expired'],
    ['Banned', 'revoked'],
  ] as const)('terminalizes a %s Collections item', (status, lifecycle) => {
    const result = verifyMicrosoftStoreAuthoritativeState({
      ...base,
      collection: { ...base.collection, status, endDate: '2026-01-01T12:00:00Z' },
    })

    expect(result).toMatchObject({
      accepted: true,
      observation: { lifecycle, autoRenews: false, terminalAt: expect.any(Date) },
    })
  })
  it.each(['Inactive', 'Canceled', 'Failed'] as const)(
    'terminalizes a %s recurrence despite an active Collections item',
    recurrenceState => {
      const result = verifyMicrosoftStoreAuthoritativeState({
        ...base,
        recurrence: { ...base.recurrence, recurrenceState },
      })

      expect(result).toMatchObject({
        accepted: true,
        observation: { lifecycle: 'expired', autoRenews: false, terminalAt: expect.any(Date) },
      })
    },
  )
  it('uses an explicit cancellation date as the terminal instant', () => {
    const cancelledAt = new Date(Date.now() - 60_000)
    const result = verifyMicrosoftStoreAuthoritativeState({
      ...base,
      recurrence: {
        ...base.recurrence,
        recurrenceState: 'Canceled',
        cancellationDate: cancelledAt.toISOString(),
      },
    })

    expect(acceptedObservation(result).terminalAt).toEqual(cancelledAt)
  })
  it('caps dunning access at corroborated Collections endDate', () => {
    const result = verifyMicrosoftStoreAuthoritativeState({
      ...base,
      collection: { ...base.collection, endDate: '2099-01-02T00:00:00Z' },
      recurrence: {
        ...base.recurrence,
        recurrenceState: 'InDunning',
        expirationTimeWithGrace: '2099-01-03T00:00:00Z',
      },
    })
    expect(result).toMatchObject({
      accepted: true,
      observation: { expiresAt: new Date('2099-01-02T00:00:00Z'), autoRenews: true },
    })
  })
  it('expires dunning when the corroborated Collections endDate has passed', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-02T00:00:00Z'))
      const result = verifyMicrosoftStoreAuthoritativeState({
        ...base,
        collection: { ...base.collection, endDate: '2026-09-01T00:00:00Z' },
        recurrence: {
          ...base.recurrence,
          recurrenceState: 'InDunning',
          expirationTime: '2026-08-01T00:00:00Z',
          expirationTimeWithGrace: '2099-01-03T00:00:00Z',
        },
      })

      expect(result).toMatchObject({
        accepted: true,
        observation: {
          lifecycle: 'expired',
          expiresAt: new Date('2026-09-01T00:00:00Z'),
          terminalAt: new Date('2026-09-01T00:00:00Z'),
          autoRenews: false,
        },
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
function acceptedObservation(result: MicrosoftStoreVerificationResult) {
  if (!result.accepted) throw new Error(`Expected accepted observation: ${result.reasonCode}`)
  return result.observation
}
