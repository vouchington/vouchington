import type { NotificationsResponseBody } from '@/types/api-responses'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'

export function mergeNotificationPages(
  pages: NotificationsResponseBody[],
  deletedIds: Set<string>,
  readAtById: Record<string, string>,
): NotificationsResponseBody {
  const mergedResults = mergePageResultsById(pages).flatMap(result =>
    deletedIds.has(result.id)
      ? []
      : [{ ...result, read_at: readAtById[result.id] ?? result.read_at }],
  )
  const mergedNotifications = mergeRecords(pages, page => page.notifications)

  return {
    results: mergedResults,
    notifications: Object.fromEntries(
      Object.entries(mergedNotifications).flatMap(([id, notification]) =>
        deletedIds.has(id)
          ? []
          : [[id, { ...notification, read_at: readAtById[id] ?? notification.read_at }]],
      ),
    ),
    communities: mergeRecords(pages, page => page.communities),
    actors: mergeRecords(pages, page => page.actors),
    posts: mergeRecords(pages, page => page.posts),
    rss_feed_items: mergeRecords(pages, page => page.rss_feed_items),
    copyright_notices: mergeRecords(pages, page => page.copyright_notices),
    public_texts: mergeRecords(pages, page => page.public_texts),
    page_info: pages.at(-1)!.page_info,
  }
}
