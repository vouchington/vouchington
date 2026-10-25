import { hasNavigatorGlobalPrivacyControl } from '@/lib/privacy/global-privacy-control'
import { clientApi } from './instance'

function trackView(path: string): Promise<void> {
  if (hasNavigatorGlobalPrivacyControl()) return Promise.resolve()
  return clientApi.post<void>(path, undefined, { keepalive: true })
}

export function trackRssFeedView(rssFeedId: string): Promise<void> {
  return trackView(`/api/v1/rss-feeds/${rssFeedId}/views`)
}

export function trackRssFeedItemView(rssFeedItemId: string): Promise<void> {
  return trackView(`/api/v1/rss-feed-items/${rssFeedItemId}/views`)
}
