import { read } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import { contentHash, seedUuid, seedUuidAtTimestamp } from './common.mts'
import { addUtcMonths, nextUtcMonthStart } from './comment-descendant-partition-storage.mts'

export const HACKER_NEWS_SCALE_POST_COUNT = 1_000_000
export const HACKER_NEWS_SCALE_MATCH_COUNT = 1_000
export const HACKER_NEWS_SCALE_UNVOTED_URL_COUNT = 3_000
export const HACKER_NEWS_SCALE_PARTITION_PREFIX = 'posts__explain_5053_hn_'
const PARTITION_COUNT = 24
const IDENTITY_SERIAL = 9_053_000
const POST_SERIAL = 30_000_000

export interface HackerNewsScalePartition {
  name: string
  month: number
  start: number
  count: number
  idPrefix: string
}

export interface HackerNewsScaleFixture {
  actorId: string
  hostnameId: string
  urlIds: string[]
  partitions: HackerNewsScalePartition[]
  decisionInstant: Date
  matchingPostIds: string[]
  heavyPostId: string
  postCount: number
}

export function buildHackerNewsScaleFixture(): HackerNewsScaleFixture {
  // The existing comment phase owns future months 1–24. These ranges start at month 25.
  const firstMonth = addUtcMonths(nextUtcMonthStart(Date.now()), 24)
  let start = 0
  const partitions = Array.from({ length: PARTITION_COUNT }, (_, index) => {
    const month = addUtcMonths(firstMonth, index)
    const count =
      Math.floor(HACKER_NEWS_SCALE_POST_COUNT / PARTITION_COUNT) +
      (index < HACKER_NEWS_SCALE_POST_COUNT % PARTITION_COUNT ? 1 : 0)
    const partition = {
      name: `${HACKER_NEWS_SCALE_PARTITION_PREFIX}${new Date(month).toISOString().slice(0, 7).replace('-', '_')}`,
      month,
      start,
      count,
      idPrefix: seedUuidAtTimestamp(month + 14 * 86_400_000, 0).slice(0, 24),
    }
    start += count
    return partition
  })
  const fixture: HackerNewsScaleFixture = {
    actorId: seedUuid(IDENTITY_SERIAL, '01'),
    hostnameId: seedUuid(IDENTITY_SERIAL, '02'),
    urlIds: Array.from({ length: HACKER_NEWS_SCALE_UNVOTED_URL_COUNT + 1 }, (_, index) =>
      seedUuid(IDENTITY_SERIAL + index, '03'),
    ),
    partitions,
    decisionInstant: new Date(addUtcMonths(firstMonth, PARTITION_COUNT)),
    matchingPostIds: [],
    heavyPostId: '',
    postCount: HACKER_NEWS_SCALE_POST_COUNT,
  }
  fixture.matchingPostIds = Array.from({ length: HACKER_NEWS_SCALE_MATCH_COUNT }, (_, index) =>
    hackerNewsScalePostId(fixture, index * 1_000),
  )
  fixture.heavyPostId = hackerNewsScalePostId(fixture, HACKER_NEWS_SCALE_POST_COUNT - 1)
  return fixture
}

export function hackerNewsScalePostId(fixture: HackerNewsScaleFixture, ordinal: number): string {
  const partition = fixture.partitions.find(p => ordinal >= p.start && ordinal < p.start + p.count)
  if (!partition) throw new Error(`HN scale post ordinal is outside its corpus: ${ordinal}`)
  return partition.idPrefix + (POST_SERIAL + ordinal).toString(16).padStart(12, '0')
}

/** Call before ordinary scenarios: a failed prior scale run requires disposable DB recreation. */
export async function assertNoLeftoverHackerNewsScalePartitions(): Promise<void> {
  const { rows } = await read<{ name: string }>(
    `/* assertNoLeftoverHackerNewsScalePartitions */ SELECT relation.relname AS name
     FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = current_schema()
       AND starts_with(relation.relname, $1) AND relation.relkind IN ('r', 'p') LIMIT 25`,
    [HACKER_NEWS_SCALE_PARTITION_PREFIX],
  )
  if (rows.length)
    throw new Error(
      `Leftover #5053 HN partitions (${rows.map(row => row.name).join(', ')}); recreate the disposable EXPLAIN database before running ordinary scenarios.`,
    )
}

export async function insertHackerNewsScalePartitions(
  query: QueryExecutor,
  fixture: HackerNewsScaleFixture,
): Promise<void> {
  const hash = contentHash('hacker-news-scale-5053')
  for (const partition of fixture.partitions) {
    const lower = seedUuidAtTimestamp(partition.month, 0)
    const upper = seedUuidAtTimestamp(addUtcMonths(partition.month, 1), 0)
    // Autovacuum is off: its worker pins leaf buffers while it runs, and cold-cache eviction fails
    // on any pinned buffer. Statistics come from the explicit ANALYZE calls before each capture.
    // no-mistakes-disable-next-line query-reached-per-item: exactly 24 owned monthly partitions are created once in the disposable EXPLAIN database.
    await query(
      `/* createHackerNewsScalePartition */ CREATE TABLE ${partition.name} PARTITION OF posts
       FOR VALUES FROM ('${lower}'::uuid) TO ('${upper}'::uuid)
       WITH (autovacuum_enabled = false)`,
    )
    // no-mistakes-disable-next-line query-reached-per-item: each fixed partition receives at most 41,667 rows through one bounded set-based insert; no individual post calls.
    await query(
      `/* insertHackerNewsScalePosts */ INSERT INTO posts (
        id, created_via, post_type, markdown, created_by_id, approved_at,
        votes_score_up, votes_count_up,
        bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
      ) SELECT ($1 || lpad(to_hex($2::bigint + ordinal), 12, '0'))::uuid,
        'system', 'discussion', 'HN scale fixture', $3, now(),
        1 + (ordinal * 17) % 101, 1 + (ordinal * 17) % 101, $4, $4
        FROM generate_series($5::int, $5::int + $6::int - 1) AS fixture(ordinal)`,
      [partition.idPrefix, POST_SERIAL, fixture.actorId, hash, partition.start, partition.count],
    )
  }
}
