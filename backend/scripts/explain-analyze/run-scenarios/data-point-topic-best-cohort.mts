import { registerScenarioContract, type PlanExpectation } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  DATA_POINT_TOPIC_BEST_ID,
  DATA_POINT_TOPIC_BEST_SECOND_ID,
  deleteDataPointTopicBestCohort,
  seedDataPointTopicBestCohort,
} from '../seed-data/data-point-topic-best-cohort.mts'
import * as services from '../run-services.mts'

const { getPostIds } = services
const PAGE_LIMIT = 100

export async function runDataPointTopicBestCohortScenarios(): Promise<void> {
  await seedDataPointTopicBestCohort()
  try {
    const firstPage = await getPostIds(undefined, queryOptions({}))
    const afterFirstPage = requireCursor(firstPage.page_info.end_cursor, 'dense first page')
    const multiTopicIds = [DATA_POINT_TOPIC_BEST_ID, DATA_POINT_TOPIC_BEST_SECOND_ID]
    const sparsePage = await getPostIds(
      undefined,
      queryOptions({ data_point_topic_ids: multiTopicIds }),
    )
    await capture('search-data-points-topic-best-cohort-first')
    await capture('search-data-points-topic-best-cohort-within', {
      after: afterFirstPage,
    })
    await capture('search-data-points-topic-best-cohort-multi-topic', {
      data_point_topic_ids: multiTopicIds,
    })
    await capture('search-data-points-topic-best-cohort-next', {
      ...(sparsePage.page_info.end_cursor ? { after: sparsePage.page_info.end_cursor } : {}),
      data_point_topic_ids: multiTopicIds,
    })
  } finally {
    await deleteDataPointTopicBestCohort()
  }
}

function queryOptions(filters: { data_point_topic_ids?: string[] }) {
  return {
    post_types: ['data_point'] as ['data_point'],
    sort: 'best' as const,
    time_range: 'all' as const,
    limit: PAGE_LIMIT,
    data_point_topic_ids: filters.data_point_topic_ids ?? [DATA_POINT_TOPIC_BEST_ID],
  }
}

function requireCursor(cursor: string | null, pageName: string): string {
  if (!cursor) throw new Error(`Topic-best EXPLAIN fixture has no cursor after the ${pageName}`)
  return cursor
}

async function capture(
  scenario: string,
  options: { after?: string; data_point_topic_ids?: string[] } = {},
): Promise<void> {
  const query = {
    ...queryOptions(options),
    ...(options.after ? { after: options.after } : {}),
  }
  const expectations: PlanExpectation[] = [
    { kind: 'maxProcessedRows', relation: 'posts', max: 3_010 },
    { kind: 'maxProcessedRows', relation: 'post_data_point_topics', max: 2_010 },
    { kind: 'maxBitmapIndexRows', max: 1_050 },
  ]
  registerScenarioContract(scenario, {
    allowEmptyResult: false,
    expectations,
    crossPartition: {
      posts: 'The topic cohort spans the seeded UUIDv7 post range across monthly partitions.',
      post_data_point_topics:
        'Topic links share the post UUIDv7 range and are partitioned with their posts.',
    },
  })
  await runAndCapture(scenario, () => getPostIds(undefined, query))
}
