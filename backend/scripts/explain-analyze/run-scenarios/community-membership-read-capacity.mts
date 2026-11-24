import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { listUserMemberCommunities } from '@services/communities/members/member-communities'
import { getMyCommunityMemberships } from '@services/communities/members/list-mine'
import {
  COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES,
  getCachedUserMemberships,
  invalidateCommunityMembershipCaches,
} from '@services/entity-cache/community-memberships'
import sql from 'sql-template-strings'
import { runAndCapture, seedUser } from '../run-support.mts'

const membershipLimit = COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES.communities_per_user
const pageLimit = 100

async function seedMemberships() {
  const name = `explain-membership-read-${randomUUID()}`
  await using transaction = await beginTransaction()
  const { rows: users } = await transaction<{ id: string }>(sql`
    /* seedMembershipReadUser */
    INSERT INTO users (username) VALUES (${name}) RETURNING id
  `)
  const userId = users[0]!.id
  const { rows: communities } = await transaction<{
    id: string
    visibility: 'public' | 'private'
  }>(sql`
    /* seedMembershipReadCommunities */
    INSERT INTO communities (name, slug, created_by_id, created_via, visibility)
    SELECT 'Explain membership read ' || n, ${name}::text || '-' || n, ${seedUser.id}, 'system',
      (CASE WHEN n % 20 = 0 THEN 'private' ELSE 'public' END)::privacy_types
    FROM generate_series(1, ${membershipLimit}::int) AS input(n)
    RETURNING id, visibility
  `)
  const communityIds = communities.map(row => row.id)
  const { rows: memberships } = await transaction<{ id: string; community_id: string }>(sql`
    /* seedMembershipReadMemberships */
    INSERT INTO community_members (community_id, user_id)
    SELECT community_id, ${userId}
    FROM unnest(${communityIds}::uuid[]) AS input(community_id)
    RETURNING id, community_id
  `)
  await transaction.commit()
  const publicCommunities = new Set(
    communities.filter(row => row.visibility === 'public').map(row => row.id),
  )
  return {
    userId,
    communityIds,
    membershipIds: memberships.map(row => row.id).toSorted(),
    publicMembershipIds: memberships
      .filter(row => publicCommunities.has(row.community_id))
      .map(row => row.id)
      .toSorted(),
  }
}

async function deleteMembershipFixture(userId: string, communityIds: string[]): Promise<void> {
  await write(sql`/* deleteMembershipReadCommunities */
    DELETE FROM communities WHERE id = ANY(${communityIds}::uuid[])`)
  await write(sql`/* deleteMembershipReadUser */ DELETE FROM users WHERE id = ${userId}`)
}

export async function runCommunityMembershipReadCapacityScenarios(): Promise<void> {
  const { userId, communityIds, membershipIds, publicMembershipIds } = await seedMemberships()
  try {
    assert.equal(membershipIds.length, membershipLimit)
    await runAndCapture(
      'community-membership-cache-user-at-cap',
      async () => {
        const cached = await getCachedUserMemberships(userId)
        assert.deepEqual(
          cached?.map(row => row.id),
          membershipIds,
        )
      },
      undefined,
      'membershipCache:user',
      { exactCapturedNames: ['membershipCache:user'] },
    )

    const start = membershipLimit - 2 * pageLimit
    const scope = `my-communities:${userId}`
    const after = encodeScopedUuidCursor(membershipIds[start - 1]!, scope)
    const expectedIds = membershipIds.slice(start, start + pageLimit)
    await runAndCapture(
      'my-community-memberships-at-cap',
      async () => {
        await using transaction = await beginTransaction()
        const page = await getMyCommunityMemberships(
          userId,
          { limit: pageLimit, after },
          { query: transaction },
        )
        assert.deepEqual(
          page.results.map(row => row.id),
          expectedIds,
        )
        assert.equal(page.page_info.has_next_page, true)
        assert.equal(page.page_info.end_cursor, encodeScopedUuidCursor(expectedIds.at(-1)!, scope))
      },
      undefined,
      'getMyCommunityMemberships',
      { exactCapturedNames: ['getMyCommunityMemberships'] },
    )

    const profileScope = `user:${userId}:communities:member`
    const profileStart = Math.floor(publicMembershipIds.length / 2)
    const profileAfter = encodeScopedUuidCursor(
      publicMembershipIds[profileStart - 1]!,
      profileScope,
    )
    const profileExpectedIds = publicMembershipIds.slice(profileStart, profileStart + pageLimit)
    await runAndCapture(
      'list-user-member-communities-at-cap',
      async () => {
        const page = await listUserMemberCommunities(userId, seedUser, {
          limit: pageLimit,
          after: profileAfter,
        })
        assert.equal(page.results.length, pageLimit)
        assert.deepEqual(
          page.results.map(row => row.id),
          profileExpectedIds,
        )
        assert.deepEqual(page.page_info, {
          has_next_page: true,
          start_cursor: encodeScopedUuidCursor(profileExpectedIds[0]!, profileScope),
          end_cursor: encodeScopedUuidCursor(profileExpectedIds.at(-1)!, profileScope),
        })
      },
      undefined,
      'listUserMemberCommunities',
      { exactCapturedNames: ['listUserMemberCommunities'] },
    )
  } finally {
    await Promise.all([
      deleteMembershipFixture(userId, communityIds),
      invalidateCommunityMembershipCaches([userId], []),
    ])
  }
}
