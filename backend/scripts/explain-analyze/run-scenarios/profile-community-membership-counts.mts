import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { countUserMemberCommunities } from '@services/communities/members/member-communities'
import { PROFILE_COUNT_CAP_DEFAULT } from '@services/users/profile-count-cap'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const SCENARIO = 'profile-community-membership-counts-at-cap'
const QUERY = 'countUserMemberCommunities'
const PUBLIC_MEMBERSHIPS = PROFILE_COUNT_CAP_DEFAULT - 100
const LIVE_MEMBERSHIPS = PROFILE_COUNT_CAP_DEFAULT + 100
const DELETED_COMMUNITIES = 20
const MEMBERSHIP_FIXTURE_ROWS = LIVE_MEMBERSHIPS + DELETED_COMMUNITIES + 40

async function seedProfileMemberships() {
  const username = `explain-profile-member-${randomUUID().slice(0, 12)}`
  const { rows } = await write<{ user_id: string; community_ids: string[] }>(
    `/* seedProfileCommunityMembershipCount */
    WITH target_user AS (
      INSERT INTO users (username, community_memberships_visibility)
      VALUES ($1, 'everyone') RETURNING id
    ), fixture AS MATERIALIZED (
      SELECT n, $1 || '-' || n AS slug FROM generate_series(1, $5::int) AS input(n)
    ), owned_communities AS (
      INSERT INTO communities (name, slug, created_by_id, created_via, visibility, deleted_at)
      SELECT 'Profile count community', slug, $6, 'system',
        CASE WHEN n > $2 AND n <= $3 THEN 'private'::privacy_types ELSE 'public' END,
        CASE WHEN n > $3 AND n <= $4 THEN CURRENT_TIMESTAMP END
      FROM fixture RETURNING id, slug
    ), owned_memberships AS (
      INSERT INTO community_members (community_id, user_id, removed_at)
      SELECT c.id, u.id, CASE WHEN f.n > $4 THEN CURRENT_TIMESTAMP END
      FROM owned_communities c JOIN fixture f USING (slug)
      CROSS JOIN target_user u
      RETURNING community_id, user_id
    )
    SELECT user_id, array_agg(community_id) AS community_ids
    FROM owned_memberships GROUP BY user_id`,
    [
      username,
      PUBLIC_MEMBERSHIPS,
      LIVE_MEMBERSHIPS,
      LIVE_MEMBERSHIPS + DELETED_COMMUNITIES,
      MEMBERSHIP_FIXTURE_ROWS,
      seedUser.id,
    ],
  )
  return { ...rows[0]!, username }
}

export async function runProfileCommunityMembershipCounts(): Promise<void> {
  const { user_id, community_ids, username } = await seedProfileMemberships()
  try {
    assert.equal(community_ids.length, MEMBERSHIP_FIXTURE_ROWS)
    registerScenarioContract(SCENARIO, {
      expectations: [
        {
          kind: 'maxProcessedRows',
          relation: 'community_members',
          // The descending membership index reaches deleted communities before the capped live rows.
          max: PROFILE_COUNT_CAP_DEFAULT + 1 + DELETED_COMMUNITIES,
          captureIndex: 0,
        },
        {
          kind: 'maxProcessedRows',
          relation: 'community_members',
          max: MEMBERSHIP_FIXTURE_ROWS,
          captureIndex: 1,
        },
        { kind: 'maxProcessedRows', relation: 'communities', max: MEMBERSHIP_FIXTURE_ROWS },
      ],
    })
    await runAndCapture(
      SCENARIO,
      async () => {
        assert.deepEqual(
          await countUserMemberCommunities(user_id, { ...seedUser, id: user_id, username }),
          { count: PROFILE_COUNT_CAP_DEFAULT, capped: true },
        )
        assert.deepEqual(await countUserMemberCommunities(user_id, null), {
          count: PUBLIC_MEMBERSHIPS,
          capped: false,
        })
      },
      undefined,
      QUERY,
      { exactCapturedNames: [QUERY, QUERY] },
    )
  } finally {
    await write(
      '/* cleanupProfileCountCommunities */ DELETE FROM communities WHERE id = ANY($1::uuid[])',
      [community_ids],
    )
    await write('/* cleanupProfileCountUser */ DELETE FROM users WHERE id = $1', [user_id])
  }
}
