import { emit, type WebPageViewRecord } from '@data-stores/analytics'

interface PageViewOptions {
  pageId?: string
  sessionId?: string
  userId?: string
  referrer?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
}

function makeBase(
  pageKind: WebPageViewRecord['page_kind'],
  opts: PageViewOptions,
): WebPageViewRecord {
  const now = new Date()
  return {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
    page_kind: pageKind,
    page_id: opts.pageId,
    session_id: opts.sessionId,
    user_id: opts.userId,
    referrer: opts.referrer,
    utm_source: opts.utmSource,
    utm_medium: opts.utmMedium,
    utm_campaign: opts.utmCampaign,
    utm_content: opts.utmContent,
  }
}

export function recordLandingPageVisit(opts: PageViewOptions): void {
  emit('web_page_view', makeBase('landing_page', opts))
}

export function recordRecentlyViewedTopic(opts: PageViewOptions): void {
  emit('web_page_view', makeBase('topic', opts))
}

export function recordRecentlyViewedPost(opts: PageViewOptions): void {
  emit('web_page_view', makeBase('post', opts))
}

export function recordRecentlyViewedRssFeedItem(opts: PageViewOptions): void {
  emit('web_page_view', makeBase('rss_feed_item', opts))
}

export function recordRecentlyViewedRssFeed(opts: PageViewOptions): void {
  emit('web_page_view', makeBase('rss_feed', opts))
}

export function recordRecentlyViewedUser(opts: PageViewOptions): void {
  emit('web_page_view', makeBase('user', opts))
}
