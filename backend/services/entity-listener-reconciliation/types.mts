export type ReconciledEntityType =
  | 'user'
  | 'topic'
  | 'post_created'
  | 'post_updated'
  | 'post_deleted'
  | 'image'
  | 'url'
  | 'community'
  | 'rss_feed_item'
  | 'api_key'
  | 'blocklisted_domain'
  | 'embedding'
  | 'post_slug'
  | 'url_hostname'
  | 'topic_alias'

export type EntityReconciliationCandidate = {
  entityType: ReconciledEntityType
  entityId: string
  changedAtEpochUs: string
  changeId?: string
  contentChanged?: boolean
  referrerId?: string
  createdInWindow?: boolean
}

export type EntityReconciliationWindow = {
  start: Date
  end: Date
}
