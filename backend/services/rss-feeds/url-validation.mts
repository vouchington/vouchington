import { isHttpUrlWithoutFragment, isPublicHostname } from '@modules/utils'

export function isPublicRssFeedUrl(rssFeedUrl: string): boolean {
  if (!isHttpUrlWithoutFragment(rssFeedUrl)) return false
  try {
    return isPublicHostname(new URL(rssFeedUrl).hostname)
  } catch {
    return false
  }
}
