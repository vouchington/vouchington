import type { Page } from '@playwright/test'

export function captureIndividualElectionRequests(page: Page) {
  const requests: string[] = []

  page.on('request', request => {
    const url = request.url()
    if (
      /\/api\/v1\/(?:post|topic|hostname|rss-feed-item|entity-relation)-elections\/[^/?]+(?:\?|$)/.test(
        url,
      ) ||
      /\/api\/v1\/[^/?]+\/[^/?]+\/election(?:\?|$)/.test(url)
    ) {
      requests.push(url)
    }
  })

  return requests
}
