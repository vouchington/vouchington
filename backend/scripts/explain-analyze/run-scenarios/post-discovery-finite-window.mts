import { encodeCursor } from '@modules/pagination'
import { postSearchCursorScope } from '@services/posts/search/get-ids-cursor'
import type { PostSearchOptions } from '@voucha/types/entities/post-search'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedTopicId, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { getPostIds } from '../run-services.mts'
import { POST_DISCOVERY_FIXTURE_SEEDED_ROWS } from '../post-discovery-seeded-rows.mts'

/** An older keyset cursor must exhaust a finite newest window before the raw LIMIT. */
export async function runPostDiscoveryFiniteWindowScenario(): Promise<void> {
  const options: PostSearchOptions = {
    sort: 'new',
    time_range: '1d',
    limit: 25,
    after: encodeCursor({
      id: seedUuid(3000, '05'),
      scope: postSearchCursorScope('new', '1d', Date.now()),
    }),
  }
  await captureFiniteWindow('post-discovery-global-new-finite-window-exhausted', options, false)
  await captureFiniteWindow(
    'post-discovery-data-point-topic-new-finite-window-exhausted',
    {
      ...options,
      post_types: ['data_point'],
      data_point_topic_ids: [seedTopicId],
    },
    true,
  )
}

async function captureFiniteWindow(
  id: string,
  options: PostSearchOptions,
  topicAxis: boolean,
): Promise<void> {
  const page = await getPostIds(seedUser, options)
  if (page.results.length !== 0 || page.page_info.has_next_page || page.page_info.end_cursor)
    throw new Error(`${id} must be exhausted outside the finite post window`)
  registerScenarioContract(id, {
    seededRows: POST_DISCOVERY_FIXTURE_SEEDED_ROWS,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: 50 },
      { kind: 'maxBitmapIndexRows', max: 50 },
      ...(topicAxis
        ? [{ kind: 'maxProcessedRows' as const, relation: 'post_data_point_topics', max: 50 }]
        : []),
    ],
    allowEmptyResult: true,
    crossPartition: {
      posts: 'The finite UUIDv7 cutoff bounds the newest raw index walk.',
      ...(topicAxis
        ? { post_data_point_topics: 'Topic and post UUIDv7 keys are both bounded before LIMIT.' }
        : {}),
    },
  })
  await runAndCapture(id, () => getPostIds(seedUser, options), undefined, 'buildPostSearchQuery')
}
