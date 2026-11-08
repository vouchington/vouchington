import {
  getPagedDispatchLimit,
  pagedDispatchMaxValues,
} from '@data-stores/valkey-glide-mq/paged-dispatcher-config'

/** The worker's live notification recipient page limit, shared with visibility writes. */
export function getNotificationRecipientDispatchPageLimit(): number {
  return getPagedDispatchLimit('notifications_page_size')
}

/** The fixed safety ceiling for a staged page if live config changes during dispatch. */
export function getNotificationRecipientDispatchPageHardMax(): number {
  return pagedDispatchMaxValues.notifications_page_size
}
