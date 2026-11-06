import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract, type PlanExpectation } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import * as services from '../run-services.mts'

const { getPostIds } = services

const CREDIT_POST_MAX = 20_000
const SELECTIVE_TOPIC_ID = seedUuid(1, 'ee')

type DataPointSort = 'new' | 'best' | 'hot'

export async function runDataPointSearchScenarios(): Promise<void> {
  await capture(
    'search-data-points-filtered-page',
    'new',
    { data_point_vertical: 'bank_account' },
    0,
    ['posts__default_data_point_vertical_id_idx', 'idx_posts__data_point_vertical'],
  )
  await capture(
    'search-data-points-vertical-best',
    'best',
    { data_point_vertical: 'bank_account' },
    0,
  )
  await capture(
    'search-data-points-vertical-hot',
    'hot',
    { data_point_vertical: 'bank_account' },
    0,
  )
  await capture('search-data-points-result-best', 'best', { data_point_result: 'pending' }, 0)
  await capture('search-data-points-result-hot', 'hot', { data_point_result: 'pending' }, 0)
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
  )
  await capture(
    'search-data-points-topic-best',
    'best',
    { data_point_topic_ids: [SELECTIVE_TOPIC_ID] },
    0,
  )
  await capture(
    'search-data-points-topic-hot',
    'hot',
    { data_point_topic_ids: [SELECTIVE_TOPIC_ID] },
    0,
  )
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
  maxPosts: number,
  indexes?: readonly string[],
): Promise<void> {
  const expectations: PlanExpectation[] = [
    { kind: 'maxProcessedRows', relation: 'posts', max: maxPosts },
  ]
  if (indexes) expectations.push({ kind: 'usesIndexes', indexes, anyOf: true })
  registerScenarioContract(scenario, {
    allowEmptyResult: true,
    expectations,
    crossPartition: {
      posts:
        'A selective data-point filter reads the 30-day id window, which can span id partitions.',
    },
  })
  await runAndCapture(scenario, () =>
    getPostIds(undefined, { post_types: ['data_point'], sort, limit: 21, ...filters }),
  )
}
