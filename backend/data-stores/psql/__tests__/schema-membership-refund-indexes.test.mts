import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown, read } from '../index.mts'

describe('membership refund query indexes', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('indexes both Stripe identifiers used to total prior refunds', async () => {
    const { rows } = await read<{ indexname: string; indexdef: string }>(
      `/* getMembershipRefundStripeLookupIndexes */
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'membership_refunds'
          AND indexname IN (
            'idx_mrefunds__stripe_charge_id',
            'idx_mrefunds__stripe_payment_intent_id'
          )
        ORDER BY indexname`,
    )

    expect(rows).toEqual([
      {
        indexname: 'idx_mrefunds__stripe_charge_id',
        indexdef: expect.stringContaining('USING btree (stripe_charge_id)'),
      },
      {
        indexname: 'idx_mrefunds__stripe_payment_intent_id',
        indexdef: expect.stringContaining(
          'USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL)',
        ),
      },
    ])
  })
})
