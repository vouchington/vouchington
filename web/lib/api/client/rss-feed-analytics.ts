import { hasNavigatorGlobalPrivacyControl } from '@/lib/privacy/global-privacy-control'

export function trackRssFeedView(rssFeedId: string): void {
  if (hasNavigatorGlobalPrivacyControl()) return
  if (typeof navigator.sendBeacon !== 'function') return
  navigator.sendBeacon(`/api/v1/rss-feeds/${rssFeedId}/views`)
}

export function trackRssFeedItemView(rssFeedItemId: string): void {
  if (hasNavigatorGlobalPrivacyControl()) return
  if (typeof navigator.sendBeacon !== 'function') return
  navigator.sendBeacon(`/api/v1/rss-feed-items/${rssFeedItemId}/views`)
}
