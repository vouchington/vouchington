import type { FollowerDistributionAction } from './types.mts'

export type DistributionRow = {
  id: string
  sender_user_id: string
  sender_username: string | null
  action: FollowerDistributionAction
  audience: 'all_followers' | 'selected_followers'
  post_id: string | null
  rss_feed_item_id: string | null
  selected_recipient_user_ids: string[] | null
  last_processed_recipient_user_id: string | null
  completed_at: Date | null
  failed_at: Date | null
  created_at: Date
}

export type ProcessOptions = {
  chunkSize?: number
  deferCursorUpdate?: boolean
}

export type ProcessTargetRowsResult = {
  failed: boolean
  notificationsToDeliver: Array<{ userId: string; notificationId: string }>
}
