import { describe, expect, it } from 'vitest'
import {
  getCollisionPeriod,
  getFamilyCollisionRefundAmount,
  getFamilyCollisionReversalTargets,
} from './family-proration.mts'

describe('getFamilyCollisionRefundAmount', () => {
  it('rounds the unused service allocation up to a whole minor unit', () => {
    expect(
      getFamilyCollisionRefundAmount(1_000, {
        collisionAt: new Date('2030-01-01T00:10:00.000Z'),
        periodEndsAt: new Date('2030-01-01T01:00:00.000Z'),
        periodStartedAt: new Date('2030-01-01T00:00:00.000Z'),
      }),
    ).toBe(834)
  })

  it('keeps allocation exact when the intermediate product exceeds the safe integer range', () => {
    expect(
      getFamilyCollisionRefundAmount(Number.MAX_SAFE_INTEGER, {
        collisionAt: new Date('2030-01-01T00:00:00.001Z'),
        periodEndsAt: new Date('2030-01-01T00:00:00.004Z'),
        periodStartedAt: new Date('2030-01-01T00:00:00.000Z'),
      }),
    ).toBe(6_755_399_441_055_744)
  })

  it('caps service before the period to the refundable remainder and expired service to zero', () => {
    const period = {
      periodEndsAt: new Date('2030-01-01T01:00:00.000Z'),
      periodStartedAt: new Date('2030-01-01T00:00:00.000Z'),
    }

    expect(
      getFamilyCollisionRefundAmount(1_000, {
        ...period,
        collisionAt: new Date('2029-12-31T23:00:00.000Z'),
      }),
    ).toBe(1_000)
    expect(
      getFamilyCollisionRefundAmount(1_000, {
        ...period,
        collisionAt: new Date('2030-01-01T02:00:00.000Z'),
      }),
    ).toBe(0)
  })

  it('rejects a family collision without a positive service period', () => {
    expect(() =>
      getFamilyCollisionRefundAmount(1_000, {
        collisionAt: new Date('2030-01-01T00:00:00.000Z'),
        periodEndsAt: new Date('2030-01-01T00:00:00.000Z'),
        periodStartedAt: new Date('2030-01-01T00:00:00.000Z'),
      }),
    ).toThrow('requires a positive service period')
  })

  it('preserves the unprorated provider observation for future reconciliation', () => {
    expect(
      getFamilyCollisionReversalTargets(
        [
          {
            amountMinorUnits: 1_000,
            chargeId: 'ch_family_observed',
            currency: 'usd',
            invoiceId: 'in_family_observed',
            paymentIntentId: null,
            qualifyingAmountMinorUnits: 1_000,
          },
        ],
        {
          collisionAt: new Date('2030-01-01T00:30:00.000Z'),
          periodEndsAt: new Date('2030-01-01T01:00:00.000Z'),
          periodStartedAt: new Date('2030-01-01T00:00:00.000Z'),
        },
      ),
    ).toEqual([
      expect.objectContaining({ amountMinorUnits: 500, providerObservedAmountMinorUnits: 1_000 }),
    ])
  })

  it('subtracts succeeded external refunds from the original prorated obligation', () => {
    expect(
      getFamilyCollisionReversalTargets(
        [
          {
            amountMinorUnits: 800,
            chargeId: 'ch_family_external_refund',
            currency: 'usd',
            invoiceId: 'in_family_external_refund',
            externallySatisfiedMinorUnits: 200,
            paymentIntentId: null,
            providerObservedAmountMinorUnits: 800,
            qualifyingAmountMinorUnits: 1_000,
          },
        ],
        {
          collisionAt: new Date('2030-01-01T00:30:00.000Z'),
          periodEndsAt: new Date('2030-01-01T01:00:00.000Z'),
          periodStartedAt: new Date('2030-01-01T00:00:00.000Z'),
        },
      ),
    ).toEqual([
      expect.objectContaining({
        amountMinorUnits: 300,
        externallySatisfiedMinorUnits: 200,
        providerObservedAmountMinorUnits: 800,
        qualifyingAmountMinorUnits: 500,
      }),
    ])
  })

  it('rounds one split-payment invoice obligation once', () => {
    const targets = getFamilyCollisionReversalTargets(
      [
        {
          amountMinorUnits: 1,
          chargeId: 'ch_family_first',
          currency: 'usd',
          invoiceId: 'in_family_split',
          paymentIntentId: null,
          qualifyingAmountMinorUnits: 1,
        },
        {
          amountMinorUnits: 1,
          chargeId: 'ch_family_second',
          currency: 'usd',
          invoiceId: 'in_family_split',
          paymentIntentId: null,
          qualifyingAmountMinorUnits: 1,
        },
      ],
      {
        collisionAt: new Date('2030-01-01T00:30:00.000Z'),
        periodEndsAt: new Date('2030-01-01T01:00:00.000Z'),
        periodStartedAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    )

    expect(targets.map(target => target.amountMinorUnits)).toEqual([1, 0])
    expect(targets.reduce((total, target) => total + target.amountMinorUnits, 0)).toBe(1)
  })

  it('keeps a later payment refund out of an earlier fixed prorated slice', () => {
    expect(
      getFamilyCollisionReversalTargets(
        [
          {
            amountMinorUnits: 1,
            chargeId: 'ch_family_first',
            currency: 'usd',
            invoiceId: 'in_family_timing',
            paymentIntentId: null,
            qualifyingAmountMinorUnits: 1,
          },
          {
            amountMinorUnits: 0,
            chargeId: 'ch_family_second',
            currency: 'usd',
            externallySatisfiedMinorUnits: 1,
            invoiceId: 'in_family_timing',
            paymentIntentId: null,
            qualifyingAmountMinorUnits: 1,
          },
        ],
        {
          collisionAt: new Date('2030-01-01T00:30:00.000Z'),
          periodEndsAt: new Date('2030-01-01T01:00:00.000Z'),
          periodStartedAt: new Date('2030-01-01T00:00:00.000Z'),
        },
      ),
    ).toEqual([
      expect.objectContaining({ amountMinorUnits: 1, qualifyingAmountMinorUnits: 1 }),
      expect.objectContaining({ amountMinorUnits: 0, qualifyingAmountMinorUnits: 0 }),
    ])
  })

  it('requires both service-period timestamps for a family collision', () => {
    expect(() =>
      getCollisionPeriod('family', { effectiveAt: undefined, expiresAt: undefined }, new Date()),
    ).toThrow('requires effective and expiry timestamps')
  })
})
