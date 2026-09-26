import type { TransactionQuery } from '@data-stores/psql'
import type { PostPublicationDirtyWork } from './types.mts'
import { retainPostPublicationImpacts } from './capture-impacts.mts'
import { POST_PUBLICATION_CAPTURE_BATCH_SIZE } from './constants.mts'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'
import { upsertPostPublicationDirtyWork } from './upsert-dirty-work.mts'
import { preparePostPublicationIdentityBridges } from './prepare-identity-bridges.mts'

type StoryTopicPublicationChange = {
  storyId: string
  impactedTopicIds: readonly string[]
  impactedPostIds: readonly string[]
}

/** Records bounded batches of story topic changes without per-story capture round trips. */
export async function recordStoryTopicPublicationChanges(
  query: TransactionQuery,
  changes: readonly StoryTopicPublicationChange[],
): Promise<PostPublicationDirtyWork[]> {
  const impactsByStory = new Map<string, { postIds: Set<string>; topicIds: Set<string> }>()
  for (const change of changes) {
    if (!change.storyId) throw new TypeError('Story publication change requires an identifier')
    const impacts = impactsByStory.get(change.storyId) ?? {
      postIds: new Set<string>(),
      topicIds: new Set<string>(),
    }
    for (const topicId of normalizePostPublicationIdentifiers(change.impactedTopicIds))
      impacts.topicIds.add(topicId)
    for (const postId of normalizePostPublicationIdentifiers(change.impactedPostIds))
      impacts.postIds.add(postId)
    impactsByStory.set(change.storyId, impacts)
  }
  const changesByStory = normalizePostPublicationIdentifiers(impactsByStory.keys()).map(
    scopeId => ({
      scopeId,
      impacts: impactsByStory.get(scopeId)!,
    }),
  )
  const work: PostPublicationDirtyWork[] = []
  await preparePostPublicationIdentityBridges(
    query,
    changesByStory.map(change => ({
      scope: { type: 'story' as const, storyId: change.scopeId },
      reason: 'post_topics_changed',
      impactedPostIds: [...change.impacts.postIds],
    })),
  )
  for (
    let offset = 0;
    offset < changesByStory.length;
    offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE
  ) {
    const batch = changesByStory.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- sorted bounded batches preserve global publication lock order.
    work.push(...(await recordStoryTopicPublicationChangeBatch(query, batch)))
  }
  return work
}

async function recordStoryTopicPublicationChangeBatch(
  query: TransactionQuery,
  batch: ReadonlyArray<{
    scopeId: string
    impacts: { postIds: Set<string>; topicIds: Set<string> }
  }>,
): Promise<PostPublicationDirtyWork[]> {
  const storyIds = batch.map(change => change.scopeId)
  await query(
    `/* lockStoryTopicPublicationCaptures */
    SELECT pg_advisory_xact_lock(hashtextextended('story:' || story_id::text, 0))
    FROM unnest($1::uuid[]) AS input(story_id) ORDER BY story_id`,
    [storyIds],
  )
  const work = await upsertPostPublicationDirtyWork(query, 'story', storyIds, [
    'post_topics_changed',
  ])
  const workByStoryId = new Map(
    work.flatMap(row => (row.story_id ? [[row.story_id, row.id] as const] : [])),
  )
  await retainPostPublicationImpacts(query, workByStoryId, batch)
  return work
}
