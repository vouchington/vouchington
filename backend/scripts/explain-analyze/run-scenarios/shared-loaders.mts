import { getTopicsByAnyWithRedirectBatch } from '@services/topics/get-with-redirect-batch'
import { getPostsWithRootsByAnyBatch } from '@services/posts/get-with-roots-batch'
import { canViewDelegatedPostsBatch } from '@services/posts/check-delegated-access-batch'
import { registerScenarioContract } from '../plan-expectations.mts'
import { sharedLoaderContract } from './shared-loader-contracts.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { commentSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'
import {
  SHARED_LOADER_SOURCE_ID,
  SHARED_LOADER_DESTINATION_ID,
} from '../seed-data/shared-loaders.mts'

export async function runSharedLoaderScenarios(): Promise<void> {
  registerScenarioContract('topic-redirect-batch', sharedLoaderContract('topic-redirect-batch'))
  await runAndCapture('topic-redirect-batch', async () => {
    const results = await getTopicsByAnyWithRedirectBatch([
      SHARED_LOADER_SOURCE_ID,
      SHARED_LOADER_DESTINATION_ID,
      'seed-shared-loader-source',
      'seed-shared-loader-alias',
      'seed-topic-0',
      seedUuid(999, '2b'),
    ])
    if (
      results[0]?.topic_redirect?.source_topic_id !== SHARED_LOADER_SOURCE_ID ||
      results[2]?.topic_redirect?.source_topic_id !== SHARED_LOADER_SOURCE_ID ||
      results[3]?.topic.id !== SHARED_LOADER_DESTINATION_ID ||
      results[5] !== null
    )
      throw new Error(
        'Topic batch must exercise redirects, active aliases and a missing identifier',
      )
  })
  registerScenarioContract('posts-with-roots-batch', sharedLoaderContract('posts-with-roots-batch'))
  await runAndCapture('posts-with-roots-batch', async () => {
    const commentIds = Array.from({ length: 10 }, (_, index) =>
      seedUuidAtTimestamp(commentSeedTimestampMs(0, 3), index),
    )
    const additionalRoot = seedUuid(5, '05')
    const rows = await getPostsWithRootsByAnyBatch([...commentIds, 'seed-post-1'], [additionalRoot])
    if (
      commentIds.some(id => !rows.get(id)) ||
      !rows.get(seedUuid(0, '05')) ||
      !rows.get(additionalRoot) ||
      rows.get('seed-post-1')?.id !== seedUuid(1, '05')
    )
      throw new Error('Post batch must hydrate requested comments and both discovered root sources')
  })
  registerScenarioContract(
    'delegated-post-access-batch',
    sharedLoaderContract('delegated-post-access-batch'),
  )
  await runAndCapture('delegated-post-access-batch', async () => {
    const posts = Array.from({ length: 10 }, (_, index) => ({ id: seedUuid(index, '05') }))
    const visible = await canViewDelegatedPostsBatch(seedUser, posts)
    if (![...visible.values()].some(Boolean))
      throw new Error('Delegated post visibility must exercise active post candidates')
  })
}
