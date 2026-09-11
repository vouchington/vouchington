import { expect, test, type Page } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

const CARD_ID = '019c64e6-f710-74cb-b36d-130af8ff1067'
const DISCUSSION_ID = '019c64e6-f720-7001-a001-000000000001'

function captureRemovedEndpointRequests(page: Page) {
  const removedEndpointRequests: string[] = []

  page.on('request', request => {
    const url = request.url()
    if (
      /\/api\/(?:posts|topics)\/[^/]+\/metrics(?:\?|$)/.test(url) ||
      /\/api\/(?:post|entity-relation|rss-feed-item)-elections\/[^/]+(?:\?|$)/.test(url)
    ) {
      removedEndpointRequests.push(url)
    }
  })

  return removedEndpointRequests
}

test.describe('Consolidated routes browser requests', () => {
  test('topic detail pages do not request removed metrics or election detail endpoints in the browser', async ({
    page,
  }) => {
    const removedEndpointRequests = captureRemovedEndpointRequests(page)

    await navigateTo(page, `/card/${CARD_ID}/discussions`)

    expect(removedEndpointRequests).toEqual([])
  })

  test('post detail pages do not request removed metrics or election detail endpoints in the browser', async ({
    page,
  }) => {
    const removedEndpointRequests = captureRemovedEndpointRequests(page)

    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    expect(removedEndpointRequests).toEqual([])
  })
})
