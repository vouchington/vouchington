import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
  suspendTestUser,
} from '@voucha/test-helpers'
import { cleanupUserOwnedCommunities } from '../services/data-retention/cleanup-user-communities.mts'

/** Commit the actual first ineligible moderator page, leaving its valid continuation unconsumed. */
export async function createRetiredRequesterPurgeCursor(ownerId: string) {
  const moderator = await createTestUserDirect()
  const community = await insertTestCommunity({ createdById: ownerId })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  const member = await insertTestCommunityMember({
    communityId: community.id,
    userId: moderator.id,
    role: 'moderator',
  })
  await suspendTestUser(moderator.id)
  await using query = await beginTransaction()
  const first = await cleanupUserOwnedCommunities(query, ownerId, 1)
  const cursor = first.userPurge
  if (
    !cursor ||
    cursor.communityId !== community.id ||
    cursor.afterModeratorId !== member.id ||
    first.afterCommit.length !== 0
  ) {
    throw new Error('Owned ineligible moderator page did not establish its expected continuation')
  }
  await query.commit()
  return { cursor, moderatorId: moderator.id }
}

export async function readRetiredRequesterCursorRows(
  communityId: string,
  ownerId: string,
  moderatorId: string,
) {
  const { rows } = await read(sql`/* readRetiredRequesterCursorRows */ SELECT
    (SELECT to_jsonb(community) FROM communities community WHERE id = ${communityId}) AS community,
    (SELECT COALESCE(jsonb_agg(to_jsonb(member) ORDER BY id), '[]'::jsonb)
      FROM community_members member WHERE community_id = ${communityId}) AS members,
    (SELECT COALESCE(jsonb_agg(to_jsonb(notification) ORDER BY id), '[]'::jsonb)
      FROM notifications notification WHERE user_id = ANY(${[ownerId, moderatorId]}::uuid[])) AS notifications`)
  if (!rows[0]) throw new Error('Owned community continuation rows disappeared')
  return rows[0]
}
