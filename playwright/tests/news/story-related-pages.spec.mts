import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestStoryMembers,
  setTestStoryMemberTitle,
} from '../../../backend/test-helpers/entities/story-member-pages.mts'

test.describe('bounded related story articles', () => {
  let storyId: string
  let searchTitle: string

  test.beforeAll(async () => {
    const fixture = await createTestStoryMembers(6)
    storyId = fixture.story.id
    searchTitle = `Story preview browser ${randomSuffix()}`
    await setTestStoryMemberTitle(fixture.itemIds[0]!, searchTitle)
  })

  test('expands prefetched articles without a request and preserves cards on continuation', async ({
    page,
  }) => {
    await navigateTo(page, `/news?q=${encodeURIComponent(searchTitle)}`)
    const toggle = page.getByTestId('news-item-cluster-related-toggle')
    await expect(toggle).toBeVisible()
    const panel = page.getByTestId('news-item-cluster-related-panel')
    const panelId = await panel.getAttribute('id')
    expect(panelId).not.toBeNull()
    await expect(toggle).toHaveAttribute('aria-controls', panelId!)
    const storyRequests: string[] = []
    page.on('request', request => {
      if (new URL(request.url()).pathname === `/api/v1/stories/${storyId}`)
        storyRequests.push(request.url())
    })

    await toggle.click()
    await expect(panel).toBeVisible()
    const cards = panel.getByTestId('news-item-card')
    const initialCount = await cards.count()
    expect(initialCount).toBeGreaterThan(0)
    expect(initialCount).toBeLessThanOrEqual(3)
    expect(storyRequests).toHaveLength(0)
    const firstCard = await cards.first().elementHandle()
    expect(firstCard).not.toBeNull()

    const responseGate = Promise.withResolvers<void>()
    const requestStarted = Promise.withResolvers<void>()
    await page.route(`**/api/v1/stories/${storyId}?*`, async route => {
      const response = await route.fetch()
      requestStarted.resolve()
      await responseGate.promise
      await route.fulfill({ response })
    })
    const loadMore = panel.getByTestId('news-item-cluster-related-load-more')
    await loadMore.scrollIntoViewIfNeeded()
    const beforeBounds = await cards.first().boundingBox()
    const beforeScroll = await page.evaluate(() => window.scrollY)
    await loadMore.click()
    await requestStarted.promise
    try {
      await expect(loadMore).toBeDisabled()
      await expect(cards).toHaveCount(initialCount)
      expect(await cards.first().boundingBox()).toEqual(beforeBounds)
      expect(await page.evaluate(() => window.scrollY)).toBe(beforeScroll)
    } finally {
      responseGate.resolve()
    }
    await expect(cards).toHaveCount(5)
    await expect(toggle).toContainText('5 related articles')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(storyRequests).toHaveLength(1)
    expect(new URL(storyRequests[0]!).searchParams.get('limit')).toBe('25')
    expect(await firstCard?.evaluate(element => element.isConnected)).toBe(true)
    expect(await cards.first().boundingBox()).toEqual(beforeBounds)
    expect(await page.evaluate(() => window.scrollY)).toBe(beforeScroll)
  })
})
