import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { expect } from 'vitest'
import { cleanupUserOwnedCommunities } from '../services/data-retention/cleanup-user-communities.mts'

/** Commit the real selector, role transition and notification before testing final account purge. */
export async function commitCommunityPurgeSelection(userId: string) {
  await using query = await beginTransaction()
  const page = await cleanupUserOwnedCommunities(query, userId, 1000)
  if (page.userPurge || page.processed === 0)
    throw new Error('Expected a complete owned successor selection page')
  await query.commit()
  const [notify, invalidate] = page.afterCommit
  if (page.afterCommit.length !== 2 || !notify || !invalidate)
    throw new Error('Expected transfer notification and cache effects')
  await notify()
  await invalidate()
}

export async function readCommunityFinalPurgeState(
  ownerId: string,
  communityId: string,
  participantIds: string[],
) {
  const { rows } = await read<{
    account: Record<string, unknown> | null
    identity: Record<string, unknown>
    community: Record<string, unknown>
    members: Array<Record<string, unknown>>
    notifications: Array<Record<string, unknown>>
    emails: Array<Record<string, unknown>>
    classifierPrompts: Array<Record<string, unknown>>
  }>(sql`/* readCommunityFinalPurgeState */ SELECT
    (SELECT to_jsonb(account) FROM users account WHERE id = ${ownerId}) AS account,
    (SELECT to_jsonb(identity) FROM retained_user_identities identity WHERE id = ${ownerId}) AS identity,
    (SELECT to_jsonb(community) FROM communities community WHERE id = ${communityId}) AS community,
    (SELECT COALESCE(jsonb_agg(to_jsonb(member) ORDER BY id), '[]'::jsonb)
      FROM community_members member WHERE community_id = ${communityId}) AS members,
    (SELECT COALESCE(jsonb_agg(to_jsonb(notification) ORDER BY id), '[]'::jsonb)
      FROM notifications notification WHERE user_id = ANY(${participantIds}::uuid[])) AS notifications,
    (SELECT COALESCE(jsonb_agg(to_jsonb(email) ORDER BY id), '[]'::jsonb)
      FROM user_email_addresses email WHERE user_id = ${ownerId}) AS emails,
    (SELECT COALESCE(jsonb_agg(to_jsonb(prompt) ORDER BY id), '[]'::jsonb)
      FROM classifier_prompt_versions prompt WHERE created_by_id = ${ownerId}) AS "classifierPrompts"`)
  if (!rows[0]) throw new Error('Owned community purge state disappeared')
  return rows[0]
}

export function completedCommunityFinalPurgeState(
  before: Awaited<ReturnType<typeof readCommunityFinalPurgeState>>,
  ownerId: string,
) {
  return {
    ...before,
    account: null,
    identity: { ...before.identity, purged_at: expect.any(String) },
    members: before.members.filter(row => row.user_id !== ownerId),
    emails: [],
  }
}
