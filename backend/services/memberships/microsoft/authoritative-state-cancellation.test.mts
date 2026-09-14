import { describe, expect, it } from 'vitest'
import { verifyMicrosoftStoreAuthoritativeState } from './verify-authoritative-state.mts'

describe('Microsoft Store cancellation semantics', () => {
  const recurrence = {
    id: 'synthetic-recurrence',
    productId: 'synthetic-product',
    skuId: 'synthetic-sku',
    startTime: '2026-01-01T00:00:00Z',
    expirationTime: '2099-01-02T00:00:00Z',
    lastModified: '2026-01-01T01:00:00Z',
    recurrenceState: 'Active' as const,
    autoRenew: false,
  }
  const options = {
    applicationId: 'Voucha',
    environment: 'test' as const,
    publisherUserId: 'synthetic-user',
    membershipProductId: 'synthetic-membership-product',
    productId: recurrence.productId,
    skuId: recurrence.skuId,
    collection: {
      id: 'synthetic-collection',
      recurrenceData: recurrence.id,
      modifiedDate: '2026-01-01T01:00:00Z',
      productId: recurrence.productId,
      skuId: recurrence.skuId,
      endDate: recurrence.expirationTime,
      status: 'Active' as const,
    },
    recurrence,
  }

  it('retains paid access through expiry when auto-renew is off but Recurrence stays Active', () => {
    expect(verifyMicrosoftStoreAuthoritativeState(options)).toMatchObject({
      accepted: true,
      observation: {
        lifecycle: 'active',
        terminalAt: null,
        autoRenews: false,
        expiresAt: new Date(recurrence.expirationTime),
      },
    })
  })

  it('does not entitle a Canceled recurrence even if Collections still says Active', () => {
    expect(
      verifyMicrosoftStoreAuthoritativeState({
        ...options,
        recurrence: { ...recurrence, recurrenceState: 'Canceled' },
      }),
    ).toMatchObject({
      accepted: true,
      observation: { lifecycle: 'expired', autoRenews: false, terminalAt: expect.any(Date) },
    })
  })
})
