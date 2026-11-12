import { read, write } from '@data-stores/psql'
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
    // Autovacuum is off so a worker does not pin these leaf buffers during capture. A buffer
    // another backend still has pinned is counted in eviction.skipped and does not fail the shard.
    // Statistics come from the explicit ANALYZE calls before each capture.
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
        gemini_embedding_2_content_sha256, llm_moderation_content_sha256
      ) SELECT ($1 || lpad(to_hex($2::bigint + ordinal), 12, '0'))::uuid,
        'system', 'discussion', 'HN scale fixture', $3, now(),
        1 + (ordinal * 17) % 101, 1 + (ordinal * 17) % 101, $4, $4
        FROM generate_series($5::int, $5::int + $6::int - 1) AS fixture(ordinal)`,
      [partition.idPrefix, POST_SERIAL, fixture.actorId, hash, partition.start, partition.count],
    )
  }
}

const REFERENCE_AUTOVACUUM_ROOTS = [
  'urls',
  'url_hacker_news_totals',
  'relation__post__related__url',
]

/**
 * The historical join reads these relations, which are outside the owned post leaves. A running
 * autovacuum worker pins their buffers and cold eviction then skips them. Statistics still come
 * from the explicit ANALYZE calls.
 */
export async function disableHackerNewsScaleReferenceAutovacuum(): Promise<void> {
  const { rows } = await read<{ root: string; statement: string }>(
    `/* hackerNewsScaleReferenceRelations */ SELECT parent.relname AS root,
       format('ALTER TABLE %s SET (autovacuum_enabled = false)', parent.oid::regclass) AS statement
     FROM pg_class parent
     JOIN pg_namespace namespace ON namespace.oid = parent.relnamespace
       AND namespace.nspname = current_schema()
     WHERE parent.relname = ANY($1::text[]) AND parent.relkind = 'r'
     UNION ALL
     SELECT 'relation__post__related__url',
       format('ALTER TABLE %s SET (autovacuum_enabled = false)', child.oid::regclass)
     FROM pg_partition_tree('relation__post__related__url'::regclass) tree
     JOIN pg_class child ON child.oid = tree.relid AND child.relkind = 'r'
     ORDER BY 1, 2 LIMIT 201`,
    [REFERENCE_AUTOVACUUM_ROOTS],
  )
  if (rows.length === 0 || rows.length > 200)
    throw new Error('HN scale reference relations must be a bounded local inventory')
  if (new Set(rows.map(row => row.root)).size !== REFERENCE_AUTOVACUUM_ROOTS.length)
    throw new Error('HN scale reference relations are missing from the disposable database')
  const statements = rows.map(row => {
    if (!/^ALTER TABLE [a-z0-9_."]+ SET \(autovacuum_enabled = false\)$/.test(row.statement))
      throw new Error('Unexpected HN scale autovacuum statement')
    return row.statement
  })
  await write(
    `/* cancelHackerNewsScaleAutovacuum */ SELECT pg_cancel_backend(activity.pid)
     FROM pg_stat_activity activity
     WHERE activity.datname = current_database() AND activity.backend_type = 'autovacuum worker'
       AND EXISTS (
         SELECT 1 FROM unnest($1::text[]) AS relation(name)
         WHERE strpos(activity.query, relation.name) > 0
       )`,
    [REFERENCE_AUTOVACUUM_ROOTS],
  )
  for (let attempt = 0; attempt < 20; attempt++) {
    const { rows: active } = await read<{ workers: number }>(
      `/* hackerNewsScaleAutovacuumWorkers */ SELECT count(*)::int AS workers
       FROM pg_stat_activity activity
       WHERE activity.datname = current_database() AND activity.backend_type = 'autovacuum worker'
         AND EXISTS (
           SELECT 1 FROM unnest($1::text[]) AS relation(name)
           WHERE strpos(activity.query, relation.name) > 0
         )`,
      [REFERENCE_AUTOVACUUM_ROOTS],
    )
    if ((active[0]?.workers ?? 1) === 0) break
    if (attempt === 19) throw new Error('HN scale autovacuum workers still pin reference relations')
    await new Promise(resolve => {
      setTimeout(resolve, 100)
    })
  }
  for (const statement of statements) {
    // no-mistakes-disable-next-line query-reached-per-item: at most 200 local reference relations need autovacuum off so a worker cannot pin buffers during cold eviction.
    await write(`/* disableHackerNewsScaleAutovacuum */ ${statement}`)
  }
}
