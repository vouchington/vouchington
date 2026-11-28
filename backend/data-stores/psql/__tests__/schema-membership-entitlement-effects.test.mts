import { describe, expect, it } from 'vitest'
import { readPublicIndexDefinitions } from '../../../test-helpers/data-stores/psql/schema-catalog.mts'
import { getMembershipEntitlementEffectConstraints } from '../../../test-helpers/data-stores/psql/schema-membership-entitlement-effects.mts'

describe('membership entitlement-effect schema', () => {
  it('makes delivery change-unique and token-fenced', async () => {
    const constraints = await getMembershipEntitlementEffectConstraints()
    expect(constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ definition: expect.stringContaining('delivery_claim_token') }),
      ]),
    )
    const indexes = await readPublicIndexDefinitions([
      'idx_membership_entitlement_effects__change_id',
      'idx_membership_entitlement_effects__pending',
    ])
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
