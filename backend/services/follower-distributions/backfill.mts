import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getFollowerDistributionsWorkLimit } from './work-limits.mts'

export type FollowerDistributionIdPage = { ids: string[]; hasMore: boolean }

// Sorts before every UUID, so the first page needs no separate "no cursor" predicate.
const START_OF_IDS = '00000000-0000-0000-0000-000000000000'

/**
 * One page of incomplete, unfailed distribution ids after `afterId`, in id order. `hasMore` is true
 * when the page is full, so the caller continues from its last id.
 */
export async function listIncompleteFollowerDistributionIdPage(
  afterId?: string,
): Promise<FollowerDistributionIdPage> {
  const limit = getFollowerDistributionsWorkLimit('backfill_batch_size')
  const { rows } = await read<{ id: string }>(
    sql`/* listIncompleteFollowerDistributionIdPage */
      SELECT id
      FROM follower_distributions
      WHERE completed_at IS NULL
        AND failed_at IS NULL
        AND id > ${afterId ?? START_OF_IDS}::uuid
      ORDER BY id
      LIMIT ${limit}
    `,
  )
  return { ids: rows.map(row => row.id), hasMore: rows.length === limit }
}
