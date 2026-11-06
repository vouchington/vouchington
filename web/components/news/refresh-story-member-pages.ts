import { getStoryMemberPage } from '@/lib/api/client/stories'
import type { StoryPageResponse } from '@/types/rss-feed-items'
import type { FirstStorySelection } from './news-item-cluster-projection'

/** Replay a retained cursor range serially, stopping when its viewer or selection changes. */
export async function refreshStoryMemberPages(
  storyId: string,
  selection: FirstStorySelection,
  pageCount: number,
  isCurrent: () => boolean,
): Promise<StoryPageResponse[] | null> {
  let cursor = selection.preview.page_info.end_cursor
  const pages: StoryPageResponse[] = []
  for (let index = 0; index < pageCount; index += 1) {
    if (!isCurrent()) return null
    if (!cursor) break
    // oxlint-disable-next-line no-await-in-loop -- each cursor depends on the previous page
    const response = await getStoryMemberPage(storyId, {
      after: cursor,
      excludeItemId: selection.primaryId,
    })
    if (!isCurrent()) return null
    pages.push(response)
    cursor = response.page_info.end_cursor
  }
  return isCurrent() ? pages : null
}
