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
  const statement = `/* lockStoryTopicPublicationCaptures */
    SELECT pg_advisory_xact_lock(hashtextextended('story:' || story_id::text, 0))
    FROM unnest($1::uuid[]) AS input(story_id) ORDER BY story_id`
  for (let offset = 0; offset < storyIds.length; offset += limit) {
    const page = storyIds.slice(offset, offset + limit)
    // no-mistakes-disable-next-line query-reached-per-item: each ordered lock page uses one bounded array; merging all pages loses the runtime bound.
    await query(statement, [page]) // oxlint-disable-line no-await-in-loop -- ascending pages preserve global advisory-lock order.
    for (const storyId of page) {
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
}
