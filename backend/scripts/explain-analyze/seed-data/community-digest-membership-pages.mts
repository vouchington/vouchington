import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import { COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES } from './community-membership-caps.mts'

/** Reuse the large membership fixture without changing later scenarios' community eligibility. */
export async function withArchivedDigestMemberships<T>(
  run: (communityIds: readonly string[]) => Promise<T>,
): Promise<T> {
  const communityIds = Array.from({ length: COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES }, (_, index) =>
    seedUuid(index, '22'),
  )
  const { rows: previous } = await write<{
    id: string
    archived_at: Date | null
    archived_by_id: string | null
  }>(
    `/* readDigestPlanCommunityState */ SELECT id, archived_at, archived_by_id
     FROM communities WHERE id = ANY($1::uuid[])`,
    [communityIds],
  )
  assert.equal(previous.length, communityIds.length)
  try {
    await write(
      `/* archiveDigestPlanCommunities */ UPDATE communities
       SET archived_at = CURRENT_TIMESTAMP, archived_by_id = $2::uuid
       WHERE id = ANY($1::uuid[])`,
      [communityIds, seedUuid(0, '01')],
    )
    // Only communities changes. Re-analyzing untouched tables replaces seed-time statistics:
    // the empty user_suspensions estimate then flips later moderation-recipient plans to a Sort.
    await write('/* analyzeArchivedDigestCommunities */ ANALYZE communities')
    return await run(communityIds)
  } finally {
    await write(
      `/* restoreDigestPlanCommunities */ UPDATE communities community
       SET archived_at = previous.archived_at, archived_by_id = previous.archived_by_id
       FROM unnest($1::uuid[], $2::timestamptz[], $3::uuid[])
         AS previous(id, archived_at, archived_by_id)
       WHERE community.id = previous.id`,
      [
        previous.map(row => row.id),
        previous.map(row => row.archived_at),
        previous.map(row => row.archived_by_id),
      ],
    )
    await write('/* analyzeRestoredDigestCommunities */ ANALYZE communities')
  }
}
