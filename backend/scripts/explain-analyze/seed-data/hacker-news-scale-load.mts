import { contentHash, seedUuidAtTimestamp } from './common.mts'
import { addUtcMonths } from './comment-descendant-partition-storage.mts'
import {
  POST_SERIAL,
  type HackerNewsScaleFixture,
  type HackerNewsScalePartition,
} from './hacker-news-scale-storage.mts'
import { runInParallelTransactions, type FixtureTransaction } from './parallel-fixture-load.mts'

export async function createHackerNewsScalePartitions(
  query: FixtureTransaction,
  fixture: HackerNewsScaleFixture,
): Promise<void> {
  for (const partition of fixture.partitions) {
    const lower = seedUuidAtTimestamp(partition.month, 0)
    const upper = seedUuidAtTimestamp(addUtcMonths(partition.month, 1), 0)
    // Autovacuum is off so a worker does not pin these leaf buffers during capture. A buffer
    // another backend still has pinned is counted in eviction.skipped and does not fail the shard.
    // Statistics come from the explicit ANALYZE calls before each capture.
    await query(
      `/* createHackerNewsScalePartition */ CREATE TABLE ${partition.name} PARTITION OF posts
       FOR VALUES FROM ('${lower}'::uuid) TO ('${upper}'::uuid)
       WITH (autovacuum_enabled = false)`,
    )
  }
}

/**
 * Load the posts of every partition on parallel connections. Each task owns one leaf and the
 * ordinals inside it, so the rows, their per-leaf insert order and the shared `instant` match a
 * serial load. The actor and partitions must already be committed.
 */
export async function loadHackerNewsScalePosts(
  fixture: HackerNewsScaleFixture,
  instant: string,
): Promise<void> {
  const hash = contentHash('hacker-news-scale-5053')
  await runInParallelTransactions(fixture.partitions, (query, partition) =>
    insertHackerNewsScalePosts(query, fixture.actorId, hash, instant, partition),
  )
}

async function insertHackerNewsScalePosts(
  query: FixtureTransaction,
  actorId: string,
  hash: Buffer,
  instant: string,
  partition: HackerNewsScalePartition,
): Promise<void> {
  await query(
    `/* insertHackerNewsScalePosts */ INSERT INTO posts (
      id, created_via, post_type, markdown, created_by_id, approved_at, updated_at,
      votes_score_up, votes_count_up,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
    ) SELECT ($1 || lpad(to_hex($2::bigint + ordinal), 12, '0'))::uuid,
      'system', 'discussion', 'HN scale fixture', $3, $7::timestamptz, $7::timestamptz,
      1 + (ordinal * 17) % 101, 1 + (ordinal * 17) % 101, $4, $4
      FROM generate_series($5::int, $5::int + $6::int - 1) AS fixture(ordinal)`,
    [partition.idPrefix, POST_SERIAL, actorId, hash, partition.start, partition.count, instant],
  )
}
