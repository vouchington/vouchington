import type { NotificationHydration } from '@/types/api-responses'

/** No hydrated facts: rows fall back to their generic titles and render no body. */
export const EMPTY_NOTIFICATION_HYDRATION: NotificationHydration = {
  communities: {},
  actors: {},
  posts: {},
  rss_feed_items: {},
  copyright_notices: {},
  public_texts: {},
}
