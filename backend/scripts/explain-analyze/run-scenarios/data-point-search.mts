import { read } from '@data-stores/psql'
import {
  deleteSelectiveDataPointMatches,
  seedSelectiveDataPointMatches,
  SELECTIVE_IN_WINDOW_COUNT,
  SELECTIVE_OUT_OF_WINDOW_COUNT,
  SELECTIVE_TOPIC_ID,
} from '../seed-data/data-point-search-selective.mts'
import { registerScenarioContract, type PlanExpectation } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { getPostIds } from '../run-services.mts'

const PAGE_LIMIT = 21
const JOIN_SLACK = 8
/**
 * The selective seed is smaller than the page, so the read is those in-window
 * matches plus join slack, not a walk of the other data points.
 */
const SELECTIVE_POST_MAX = Math.min(SELECTIVE_IN_WINDOW_COUNT, PAGE_LIMIT + 1) * JOIN_SLACK
/** Topic links include the older matches. The post time bound drops those. */
const SELECTIVE_TOPIC_MAX = (SELECTIVE_IN_WINDOW_COUNT + SELECTIVE_OUT_OF_WINDOW_COUNT) * JOIN_SLACK

const SEARCH_WINDOW_MINUTES = 30 * 24 * 60
const CREDIT_MATCH_STRIDE = 15
/**
 * Seeded posts are one minute apart. A data point is every third post and one
 * credit bracket is every fifth, so one bracket is every 15th post. Hot reads
 * that whole 30-day slice, then one id lookup per survivor. Best stops near
 * the page. The bound is the larger of those reads.
 */
const CREDIT_IN_WINDOW = SEARCH_WINDOW_MINUTES / CREDIT_MATCH_STRIDE
const CREDIT_POST_MAX = Math.max(CREDIT_IN_WINDOW * 2, (PAGE_LIMIT + 1) * JOIN_SLACK)

const VERTICAL_INDEXES = [
  'posts__default_data_point_vertical_id_idx',
  'idx_posts__data_point_vertical',
] as const

const RESULT_HOT_INDEX = 'idx_posts__data_point_result__positive__id'
const CREDIT_HOT_INDEX = 'idx_posts__data_point_credit_score_range__positive__id'

type DataPointSort = 'new' | 'best' | 'hot'

async function filterIndexLeaves(indexName: string): Promise<readonly string[]> {
  const { rows } = await read<{ index_name: string }>(
    `/* dataPointFilterIndexLeaves */
     SELECT index_class.relname AS index_name
     FROM pg_partition_tree($1::regclass) tree
     JOIN pg_class index_class ON index_class.oid = tree.relid
     WHERE tree.isleaf`,
    [indexName],
  )
  if (rows.length === 0) throw new Error(`${indexName} has no partition leaves`)
  return rows.map(row => row.index_name)
}

export async function runDataPointSearchScenarios(): Promise<void> {
  const resultHotIndexes = await filterIndexLeaves(RESULT_HOT_INDEX)
  const creditHotIndexes = await filterIndexLeaves(CREDIT_HOT_INDEX)
  await seedSelectiveDataPointMatches(seedUser.id)
  try {
    await capture(
      'search-data-points-filtered-page',
      'new',
      { data_point_vertical: 'bank_account' },
      SELECTIVE_POST_MAX,
      VERTICAL_INDEXES,
    )
    await capture('search-data-points-vertical-best', 'best', {
      data_point_vertical: 'bank_account',
    })
    await capture('search-data-points-vertical-hot', 'hot', { data_point_vertical: 'bank_account' })
    await capture('search-data-points-result-new', 'new', { data_point_result: 'pending' })
    await capture('search-data-points-result-best', 'best', { data_point_result: 'pending' })
    await capture(
      'search-data-points-result-hot',
      'hot',
      { data_point_result: 'pending' },
      SELECTIVE_POST_MAX,
      resultHotIndexes,
    )
    await capture(
      'search-data-points-credit-new',
      'new',
      { data_point_credit_score_range: '300-579' },
      SELECTIVE_POST_MAX,
      await filterIndexLeaves('idx_posts__structured_data__credit_score_range__id'),
    )
    await capture(
      'search-data-points-credit-best',
      'best',
      { data_point_credit_score_range: '300-579' },
      CREDIT_POST_MAX,
    )
    await capture(
      'search-data-points-credit-hot',
      'hot',
      { data_point_credit_score_range: '300-579' },
      CREDIT_POST_MAX,
      creditHotIndexes,
    )
    await capture('search-data-points-topic-new', 'new', {
      data_point_topic_ids: [SELECTIVE_TOPIC_ID],
    })
    await capture('search-data-points-topic-best', 'best', {
      data_point_topic_ids: [SELECTIVE_TOPIC_ID],
    })
    await capture('search-data-points-topic-hot', 'hot', {
      data_point_topic_ids: [SELECTIVE_TOPIC_ID],
    })
  } finally {
    await deleteSelectiveDataPointMatches()
  }
}

async function capture(
  scenario: string,
  sort: DataPointSort,
  filters: {
    data_point_vertical?: string
    data_point_result?: string
    data_point_credit_score_range?: string
    data_point_topic_ids?: string[]
  },
  maxPosts = SELECTIVE_POST_MAX,
  indexes?: readonly string[],
): Promise<void> {
  const expectations: PlanExpectation[] = [
    { kind: 'maxProcessedRows', relation: 'posts', max: maxPosts },
  ]
  if (indexes) expectations.push({ kind: 'usesIndexes', indexes, anyOf: true })
  if (filters.data_point_topic_ids)
    expectations.push({
      kind: 'maxProcessedRows',
      relation: 'post_data_point_topics',
      max: SELECTIVE_TOPIC_MAX,
    })
  registerScenarioContract(scenario, {
    allowEmptyResult: false,
    expectations,
    crossPartition: {
      posts:
        'A selective data-point filter reads the 30-day id window, which can span id partitions.',
    },
  })
  await runAndCapture(scenario, () =>
    getPostIds(undefined, { post_types: ['data_point'], sort, limit: PAGE_LIMIT, ...filters }),
  )
}
