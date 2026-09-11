import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CommunityMetrics } from './types.mts'

export async function getCommunityMetrics(
  communityId: string,
  options?: QueryOptions,
): Promise<CommunityMetrics | null> {
  const { rows } = await read(
    sql`/* getCommunityMetrics */
    SELECT *
    FROM view_community_metrics
    WHERE id = ${communityId}
    LIMIT 1
    `,
    options,
  )
  return (rows[0] as CommunityMetrics) ?? null
}
