import type { PrivateUser } from '../services/users/types.mts'
import { bookmarkEntity } from '../services/bookmarks/upsert.mts'
import { backfillUserBookmarkBloomFilter } from '../services/bookmarks/bloom-filter.mts'
import { getBookmarksForEntities } from '../services/bookmarks/get.mts'

export async function seedTopicMergeReadyBookmarkBloom(
  user: PrivateUser,
  sourceId: string,
): Promise<void> {
  await bookmarkEntity(user, 'topic', { id: sourceId }, 'follow')
  await backfillUserBookmarkBloomFilter(user.id)
}

export async function getTopicMergeBookmarks(user: PrivateUser, topicIds: string[]) {
  return getBookmarksForEntities(user, 'topic', topicIds)
}
