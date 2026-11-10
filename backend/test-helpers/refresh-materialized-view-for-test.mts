import { assertWhitelistedSqlIdentifier, type PoolClient, read, writePool } from '@data-stores/psql'

const REFRESH_ADVISORY_LOCK_NAME = 'refresh-materialized-view'

// Same names as refreshMaterializedView. Production still rejects contention; tests wait.
const REFRESHABLE_MATERIALIZED_VIEWS = new Set([
  'mv_referral_program_link_counts',
  'mv_rss_feed_crawl_tiers',
  'mv_top_hashtags',
  'mv_platform_stats',
  'mv_trending_rss_feeds',
  'mv_trending_communities',
  'mv_trending_topics',
  'mv_revenue_memberships',
  'mv_revenue_changes',
])

/** Wait on the shared refresh key, then refresh one allowlisted view. */
export async function refreshMaterializedViewForTest(viewName: string): Promise<void> {
  const quotedView = quoteAllowedView(viewName)
  const client = await writePool.connect()
  let locked = false
  let refreshError: Error | undefined
  let unlockError: Error | undefined
  try {
    await client.query(
      '/* refreshMaterializedViewForTest.lock */ SELECT pg_advisory_lock(hashtext($1))',
      [REFRESH_ADVISORY_LOCK_NAME],
    )
    locked = true
    await client.query(
      `/* refreshMaterializedViewForTest.refresh */ REFRESH MATERIALIZED VIEW CONCURRENTLY ${quotedView}`,
    )
  } catch (err) {
    refreshError = toError(err)
  } finally {
    if (locked) unlockError = await unlock(client)
    if (unlockError) client.release(unlockError)
    else client.release()
  }
  if (refreshError) throw refreshError
  if (unlockError) throw unlockError
}

export async function readTrendingCommunityMemberCountCapForTest(): Promise<number> {
  const { rows } = await read<{ member_count_cap: number }>(
    `/* readTrendingCommunityMemberCountCapForTest */
     SELECT member_count_cap
     FROM trending_community_member_count_caps
     WHERE is_singleton`,
  )
  const cap = rows[0]?.member_count_cap
  if (cap === undefined) throw new Error('Missing trending community member count cap')
  return cap
}

export async function readTrendingCommunityScoresForTest(
  ids: readonly string[],
): Promise<{ id: string; trending_score: number; members_capped: boolean }[]> {
  const { rows } = await read<{ id: string; trending_score: number; members_capped: boolean }>(
    `/* readTrendingCommunityScoresForTest */
     SELECT id, trending_score, members_capped
     FROM mv_trending_communities
     WHERE id = ANY($1::uuid[])`,
    [ids],
  )
  return rows
}

function quoteAllowedView(viewName: string): string {
  const allowedView = assertWhitelistedSqlIdentifier(
    viewName,
    REFRESHABLE_MATERIALIZED_VIEWS,
    'materialized view',
  )
  return `"${allowedView}"`
}

async function unlock(client: PoolClient): Promise<Error | undefined> {
  try {
    const result = await client.query<{ unlocked: boolean }>(
      '/* refreshMaterializedViewForTest.unlock */ SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
      [REFRESH_ADVISORY_LOCK_NAME],
    )
    if (result.rows[0]?.unlocked) return undefined
    return new Error('Materialized view advisory lock was not held at release')
  } catch (err) {
    return toError(err)
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
