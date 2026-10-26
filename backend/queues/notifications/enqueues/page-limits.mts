import { getPagedDispatchLimit } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
export { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'

/** The worker's live notification recipient page limit, shared with visibility writes. */
export function getNotificationRecipientDispatchPageLimit(): number {
  return getPagedDispatchLimit('notifications_page_size')
}
