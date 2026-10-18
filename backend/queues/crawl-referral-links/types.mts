export type ReferralCrawlDispatchCursor = {
  sweepStartedAt: string
  afterId?: string
  afterWork?: { dueAt: string; id: string }
}

export type ReferralCrawlDispatchData = {
  cursor?: ReferralCrawlDispatchCursor
  referralLinkIds?: readonly string[]
  urlId?: string
}
