import { beginTransaction } from '@data-stores/psql'
import { recordStoryTopicPublicationChanges } from './capture-story-topics.mts'

export async function recordTestStoryTopicPublicationChange(options: {
  storyId: string
  impactedPostIds: readonly string[]
  impactedTopicIds: readonly string[]
}): Promise<void> {
  await using query = await beginTransaction()
  await recordStoryTopicPublicationChanges(query, [options])
  await query.commit()
}
