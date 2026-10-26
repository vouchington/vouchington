import type { TransactionQuery } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from './work-limits.mts'
import { impactPublicationKeys } from './captured-keys.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'

type StoryTopicPublicationChange = {
  storyId: string
  impactedTopicIds: readonly string[]
  impactedPostIds: readonly string[]
}

/** Captures the old story impact while the story mutation still holds its transaction. */
export async function recordStoryTopicPublicationChanges(
  query: TransactionQuery,
  changes: readonly StoryTopicPublicationChange[],
): Promise<void> {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  if (changes.length > limit)
    throw new RangeError('Story publication changes exceed the capture page limit')
  const byStory = new Map<string, { postIds: Set<string>; topicIds: Set<string> }>()
  for (const change of changes) {
    if (!change.storyId) throw new TypeError('Story publication change requires an identifier')
    const impacts = byStory.get(change.storyId) ?? { postIds: new Set(), topicIds: new Set() }
    for (const id of normalizePostPublicationIdentifiers(change.impactedPostIds))
      impacts.postIds.add(id)
    for (const id of normalizePostPublicationIdentifiers(change.impactedTopicIds))
      impacts.topicIds.add(id)
    byStory.set(change.storyId, impacts)
  }
  const storyIds = normalizePostPublicationIdentifiers(byStory.keys())
  await query(
    `/* lockStoryTopicPublicationCaptures */
    SELECT pg_advisory_xact_lock(hashtextextended('story:' || story_id::text, 0))
    FROM unnest($1::uuid[]) AS input(story_id) ORDER BY story_id`,
    [storyIds],
  )
  for (const storyId of storyIds) {
    const impacts = byStory.get(storyId)!
    enqueueCapturedPublicationChangeAfterCommit(query, {
      scope: { type: 'story', storyId },
      reason: 'post_topics_changed',
      keys: impactPublicationKeys({
        postIds: [...impacts.postIds],
        topicIds: [...impacts.topicIds],
      }),
    })
  }
}
