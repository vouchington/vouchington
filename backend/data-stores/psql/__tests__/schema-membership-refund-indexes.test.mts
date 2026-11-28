import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import { readPublicIndexDefinitions } from '../../../test-helpers/data-stores/psql/schema-catalog.mts'

describe('membership refund query indexes', () => {
  afterAll(async () => {
    await onGracefulShutdown('SIGTERM')
  })

  it('indexes both Stripe identifiers used to total prior refunds', async () => {
    const rows = await readPublicIndexDefinitions(
      [
        'idx_membership_refunds__stripe_charge_id',
        'idx_membership_refunds__stripe_payment_intent_id',
      ],
      'membership_refunds',
    )

    expect(rows).toEqual([
      {
        indexname: 'idx_membership_refunds__stripe_charge_id',
        indexdef: expect.stringContaining('USING btree (stripe_charge_id)'),
      },
      {
        indexname: 'idx_membership_refunds__stripe_payment_intent_id',
        indexdef: expect.stringContaining(
          'USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL)',
        ),
      },
    ])
  })
})
