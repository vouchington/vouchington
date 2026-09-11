import { describe, expect, it } from 'vitest'
import { read } from '../index.mts'

describe('membership entitlement-effect schema', () => {
  it('makes delivery change-unique and token-fenced', async () => {
    const { rows: constraints } = await read<{
      constraint_name: string
      definition: string
    }>(`/* getMembershipEntitlementEffectConstraints */
      SELECT conname AS constraint_name, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'membership_entitlement_effects'::regclass
      ORDER BY conname`)
    expect(constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ definition: expect.stringContaining('delivery_claim_token') }),
      ]),
    )
    const { rows: indexes } = await read<{ indexname: string; indexdef: string }>(
      `/* getMembershipEntitlementEffectIndexes */
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1::text[])
        ORDER BY indexname`,
      [
        [
          'idx_membership_entitlement_effects__change_id',
          'idx_membership_entitlement_effects__pending',
        ],
      ],
    )
    expect(indexes).toEqual([
      {
        indexname: 'idx_membership_entitlement_effects__change_id',
        indexdef: expect.stringContaining('(membership_change_id)'),
      },
      {
        indexname: 'idx_membership_entitlement_effects__pending',
        indexdef: expect.stringContaining('WHERE (delivered_at IS NULL)'),
      },
    ])
  })
})
