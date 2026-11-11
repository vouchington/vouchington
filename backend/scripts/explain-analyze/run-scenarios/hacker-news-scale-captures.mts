import assert from 'node:assert/strict'
import { explainAnalyze, read, type ExplainResult } from '@data-stores/psql'
import { buildPostSearchQuery } from '@services/posts/search/query-builder'
import { partitionIndexLeaves } from '../partition-index-leaves.mts'
import { getHackerNewsUrlIdsByPostIds } from '@services/urls/hacker-news-post-urls'
import { registerScenarioContract } from '../plan-expectations.mts'
import { getExplainPlanCacheModes, runAndCapture } from '../run-support.mts'
import { withSeedAnchorClock } from '../seed-clock.mts'
import type { HackerNewsScaleFixture } from '../seed-data/hacker-news-scale-fixture.mts'
import {
  hackerNewsCachePreparation,
  type HackerNewsCacheState,
} from './hacker-news-scale-cache.mts'
import { buildHackerNewsScaleReference } from './hacker-news-scale-reference.mts'
import type { HackerNewsScalePage, HackerNewsScaleRow } from './hacker-news-scale-pages.mts'

let hotLeaves: readonly string[] | undefined

async function hackerNewsHotLeaves(): Promise<readonly string[]> {
  hotLeaves ??= await partitionIndexLeaves('idx_posts__hacker_news_references__stable_hot_rank__id')
  return hotLeaves
}

let postIdLeaves: readonly string[] | undefined

/** Per-partition indexes led by id: the walk an empty hot window falls back to. */
async function postIdOnlyLeaves(): Promise<readonly string[]> {
  if (postIdLeaves) return postIdLeaves
  const { rows } = await read<{ index_name: string }>(
    `/* hackerNewsScalePostIdLeaves */ SELECT index_class.relname AS index_name
     FROM pg_partition_tree('posts'::regclass) tree
     JOIN pg_index leaf_index ON leaf_index.indrelid = tree.relid
     JOIN pg_class index_class ON index_class.oid = leaf_index.indexrelid
     JOIN pg_attribute id_column ON id_column.attrelid = tree.relid
       AND id_column.attname = 'id' AND id_column.attnum = leaf_index.indkey[0]
     WHERE tree.isleaf     LIMIT 1001`,
  )
  if (rows.length === 0 || rows.length > 1000)
    throw new Error('posts id-only leaf inventory must be bounded')
  postIdLeaves = rows.map(row => row.index_name)
  return postIdLeaves
}

type CaptureContext = {
  fixture: HackerNewsScaleFixture
  observations: unknown[]
  referencePlans: ExplainResult[]
  seededRows: Record<string, number>
}

export async function captureHackerNewsScalePage(
  context: CaptureContext,
  prefix: string,
  page: HackerNewsScalePage,
  cache: HackerNewsCacheState,
): Promise<void> {
  const id = `${prefix}-${page.name}-${cache}`
  const maxPosts = 2000
  const hot = page.options.sort === 'hot'
  registerScenarioContract(id, {
    expectations: [
      { kind: 'queryBinds', token: 'posts.has_hacker_news_references' },
      ...(hot
        ? [
            {
              kind: 'usesIndexes' as const,
              // With no hot rows the planner has nothing to walk on the hot leaf, so an empty
              // window may read the per-partition id index; maxProcessedRows below keeps it bounded.
              indexes: [
                ...(await hackerNewsHotLeaves()),
                ...(prefix.startsWith('hacker-news-scale-zero-') ? await postIdOnlyLeaves() : []),
              ],
              anyOf: true,
            },
          ]
        : []),
      { kind: 'maxProcessedRows', relation: 'posts', max: maxPosts },
      { kind: 'maxBitmapIndexRows', max: maxPosts },
    ],
    allowEmptyResult: true,
    forbidSequentialScans: ['posts'],
    seededRows: context.seededRows,
    crossPartition: {
      posts: 'HN pages span the requested UUIDv7 window over real monthly post partitions.',
    },
  })
  await runAndCapture(
    id,
    async () => {
      const { rows } = await read<HackerNewsScaleRow>(buildPostSearchQuery(undefined, page.options))
      assert.deepEqual(
        rows.map(row => row.id),
        page.expectedIds,
        id,
      )
    },
    undefined,
    'buildPostSearchQuery',
    {
      decisionInstant: context.fixture.decisionInstant,
      beforeExplain: hackerNewsCachePreparation(cache, evidence => {
        context.observations.push({ scenario: id, cache, eviction: evidence })
      }),
    },
  )
}

/** Record the former predicate separately; its unbounded plans never become gate exceptions. */
export async function captureHackerNewsScaleReference(
  context: CaptureContext,
  prefix: string,
  page: HackerNewsScalePage,
): Promise<void> {
  const reference = buildHackerNewsScaleReference(page.options, context.fixture.decisionInstant)
  const { rows } = await withSeedAnchorClock(
    () => read<HackerNewsScaleRow>(reference),
    context.fixture.decisionInstant.getTime(),
  )
  assert.deepEqual(
    rows.map(row => row.id),
    page.expectedIds,
    `${prefix} join-reference parity`,
  )
  const modes = getExplainPlanCacheModes()
  for (const planCacheMode of modes) {
    const input = { text: reference.text, values: reference.values, planCacheMode }
    // no-mistakes-disable-next-line query-reached-per-item: each of two fixed plan modes requires independently evicted statement buffers before its cold/warm diagnostic pair.
    await hackerNewsCachePreparation('cold', eviction => {
      context.observations.push({ scenario: prefix, reference: true, planCacheMode, eviction })
    })(input)
    for (const cache of ['cold', 'warm'] as const) {
      // no-mistakes-disable-next-line query-reached-per-item: execute a fixed cold/warm pair in immediate succession; historical plans are evidence, not application or baseline exceptions.
      const result = await explainAnalyze(
        `${prefix}-${page.name}-join-${cache}`,
        reference.text,
        reference.values,
        { planCacheMode },
      )
      result.scenario_id = `${prefix}-${page.name}-join-${cache}`
      context.referencePlans.push(result)
    }
  }
  context.observations.push({ scenario: `${prefix}-${page.name}-join`, values: reference.values })
}

export async function captureHackerNewsUnvotedSidecar(
  context: CaptureContext,
  cache: HackerNewsCacheState,
): Promise<void> {
  const id = `hacker-news-scale-unvoted-sidecar-${cache}`
  const { rows: leaves } = await read<{ index_name: string }>(
    `/* hackerNewsScaleSidecarIndexes */ SELECT leaf.relname AS index_name
     FROM pg_partition_tree('idx_relation__post__related__url__subject__best_positive'::regclass) tree
     JOIN pg_class leaf ON leaf.oid = tree.relid WHERE tree.isleaf LIMIT 101`,
  )
  if (leaves.length === 0 || leaves.length > 100)
    throw new Error('HN positive related-URL index must have a bounded leaf inventory')
  registerScenarioContract(id, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: 2 },
      { kind: 'maxProcessedRows', relation: 'relation__post__related__url', max: 10 },
      { kind: 'maxBitmapIndexRows', max: 10 },
      {
        kind: 'usesIndexes',
        indexes: leaves.map(leaf => leaf.index_name),
        anyOf: true,
      },
    ],
    allowEmptyResult: true,
    seededRows: context.seededRows,
    crossPartition: {
      posts: 'The card URL selector reads its single explicit post key across real leaves.',
    },
  })
  await runAndCapture(
    id,
    async () => {
      const urls = await getHackerNewsUrlIdsByPostIds([context.fixture.heavyPostId])
      assert.deepEqual(urls, {}, 'Thousands of unvoted references must not appear on the card')
    },
    undefined,
    'getHackerNewsUrlIdsByPostIds',
    {
      beforeExplain: hackerNewsCachePreparation(cache, eviction => {
        context.observations.push({ scenario: id, cache, eviction })
      }),
    },
  )
}
