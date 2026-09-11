export const MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS = 100
export const FOLLOWER_DISTRIBUTION_CHUNK_SIZE = 500

export type FollowerDistributionAction =
  | 'post_share'
  | 'post_send'
  | 'rss_feed_item_share'
  | 'rss_feed_item_send'

export type FollowerDistributionAccepted = {
  status: 'accepted'
  distribution_id: string
}

export type FollowerDistributionProcessResult = {
  distributionId: string
  completed: boolean
  processed: number
  notificationsToDeliver: Array<{ userId: string; notificationId: string }>
  cursorRecipientId?: string
}
