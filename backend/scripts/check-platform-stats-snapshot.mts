import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { close, read } from '@data-stores/psql'
import { refreshMaterializedView } from '@data-stores/psql/migration-runner/refresh-materialized-view'
import {
  cleanupPlatformStatsSnapshotFixtures,
  createPlatformStatsSnapshotFixtures,
  insertPlatformStatsSnapshotFixtures,
  type PlatformStatsSnapshotFixtures,
} from '@voucha/test-helpers/platform-stats-snapshot-fixtures'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import type { PlatformStats } from '@services/platform-stats/types'
import { closeValkeyClients } from 'valkyries'
import sql from 'sql-template-strings'

const EXPECTED_DELTA: PlatformStats = {
  topic_count: 2,
  rss_feed_count: 1,
  post_count: 7,
  review_count: 3,
  data_point_count: 4,
  hostname_count: 5,
}

async function readIndependentPlatformStats(): Promise<PlatformStats> {
  const { rows } = await read<PlatformStats>(sql`/* checkPlatformStatsSnapshot.reference */
    SELECT
      (SELECT COUNT(*)::INTEGER FROM topics
       WHERE deleted_at IS NULL AND merged_into_topic_id IS NULL) AS topic_count,
      (SELECT COUNT(*)::INTEGER FROM rss_feeds
       JOIN view_rss_feed_current_states current_state
         ON current_state.rss_feed_id = rss_feeds.id
       WHERE deleted_at IS NULL AND current_state.is_enabled = TRUE) AS rss_feed_count,
      post_counts.post_count, post_counts.review_count, post_counts.data_point_count,
      (SELECT COUNT(*)::INTEGER FROM url_hostnames
       WHERE votes_count_up > 0 AND NOT is_blocked) AS hostname_count
    FROM (
      SELECT COUNT(*)::INTEGER AS post_count,
        COUNT(*) FILTER (WHERE post_type = 'review')::INTEGER AS review_count,
        COUNT(*) FILTER (WHERE post_type = 'data_point')::INTEGER AS data_point_count
      FROM view_public_post_eligibility
    ) post_counts
  `)
  return rows[0]!
}

async function main(): Promise<void> {
  const token = randomUUID().replaceAll('-', '')
  let userId: string | undefined
  const fixtures: PlatformStatsSnapshotFixtures = createPlatformStatsSnapshotFixtures(token)

  try {
    const user = await createTestUser()
    userId = user.id
    const before = await readIndependentPlatformStats()
    await insertPlatformStatsSnapshotFixtures(fixtures, user, token)
    const expected = {
      topic_count: before.topic_count + EXPECTED_DELTA.topic_count,
      rss_feed_count: before.rss_feed_count + EXPECTED_DELTA.rss_feed_count,
      post_count: before.post_count + EXPECTED_DELTA.post_count,
      review_count: before.review_count + EXPECTED_DELTA.review_count,
      data_point_count: before.data_point_count + EXPECTED_DELTA.data_point_count,
      hostname_count: before.hostname_count + EXPECTED_DELTA.hostname_count,
    }
    const actualReference = await readIndependentPlatformStats()
    assert.deepEqual(
      actualReference,
      expected,
      'The owned fixture deltas must distinguish every field',
    )

    await refreshMaterializedView('mv_platform_stats')
    const {
      rows: [published],
    } = await read<PlatformStats>(sql`/* checkPlatformStatsSnapshot.published */
      SELECT topic_count, rss_feed_count, post_count, review_count, data_point_count, hostname_count
      FROM mv_platform_stats
      WHERE singleton_id = 1
    `)
    assert.deepEqual(published, actualReference, 'The refreshed snapshot must match live data')
  } finally {
    try {
      await cleanupPlatformStatsSnapshotFixtures(fixtures, userId)
    } finally {
      try {
        await refreshMaterializedView('mv_platform_stats')
      } finally {
        try {
          await closeValkeyClients({ throwOnError: true })
        } finally {
          await close()
        }
      }
    }
  }
}

if (import.meta.main) await main()
