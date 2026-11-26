import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getActiveCommunityRestrictions } from '@services/communities/restrictions/get'
import { COMMUNITY_RESTRICTION_TYPES } from '@services/communities/restrictions/types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { ownedCommunities } from '../seed-data/owned-communities.mts'

const SCENARIO = 'community-active-restrictions-at-cap'
const QUERY = 'getActiveCommunityRestrictions'
const EXPIRED_PER_KIND = 24
const DECOY_COMMUNITIES = 24

async function seedRestrictions(communityIds: string[]): Promise<string[]> {
  const { rows } = await write<{ ids: string[] }>(
    `/* seedCommunityRestrictionPlanHistory */
    WITH inserted AS (
      INSERT INTO community_restrictions (community_id, restriction_type, activated_at, expires_at,
        lifted_at, reason)
      SELECT community_id, kind,
        CURRENT_TIMESTAMP - (n || ' hours')::interval,
        CASE WHEN n > 3 THEN CURRENT_TIMESTAMP - interval '1 hour' END,
        CASE WHEN n = 3 THEN CURRENT_TIMESTAMP END,
        CASE WHEN n = 2 THEN 'earliest active' WHEN n = 1 THEN 'later active' ELSE 'history' END
      FROM unnest($1::uuid[]) AS scope(community_id)
      CROSS JOIN unnest($2::community_restriction_types[]) AS types(kind)
      CROSS JOIN generate_series(1, $3::int + 3) AS history(n)
      RETURNING id, community_id, reason
    )
    SELECT array_agg(id ORDER BY id) AS ids FROM inserted
    WHERE community_id = ($1::uuid[])[1] AND reason = 'earliest active'`,
    [communityIds, COMMUNITY_RESTRICTION_TYPES, EXPIRED_PER_KIND],
  )
  return rows[0]!.ids
}

export async function runCommunityActiveRestrictionCapacity(): Promise<void> {
  const fixture = ownedCommunities(DECOY_COMMUNITIES + 1)
  const communityId = fixture.ids[0]!
  try {
    await fixture.seed()
    const expected = await seedRestrictions(fixture.ids)
    const cap = COMMUNITY_RESTRICTION_TYPES.length
    assert.equal(cap, 4)
    assert.equal(expected.length, cap)
    registerScenarioContract(SCENARIO, {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_community_restrictions__active_lookup'] },
        {
          kind: 'maxProcessedRows',
          relation: 'community_restrictions',
          max: cap * (EXPIRED_PER_KIND + 1),
        },
        { kind: 'maxInputRows', nodeType: 'Sort', max: cap },
      ],
    })
    await runAndCapture(
      SCENARIO,
      async () => {
        const restrictions = await getActiveCommunityRestrictions(communityId)
        assert.deepEqual(
          restrictions.map(row => row.id),
          expected,
        )
      },
      undefined,
      QUERY,
      { exactCapturedNames: [QUERY] },
    )
  } finally {
    await fixture.cleanup()
  }
}
