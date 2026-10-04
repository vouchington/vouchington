export type UnfurlReferralLinksJobs =
  | 'unfurl_referral_links_dispatcher'
  | 'unfurl_referral_link'
  | 'remove_unfurled_children_for_user'

export type UnfurlDispatchCursor = { sweepStartedAt: string; afterId?: string }
