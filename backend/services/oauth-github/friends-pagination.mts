import { nextPageUrlFromLinkHeader } from '@vouchington/utils/http-link-pagination'

export function githubFollowingHasNextPage(linkHeader: string | null, requestUrl: string): boolean {
  return nextPageUrlFromLinkHeader(linkHeader, requestUrl) !== null
}
