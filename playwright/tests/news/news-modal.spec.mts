import { test, expect } from '../../helpers/test.mts'

import { navigateTo } from '../../helpers/navigate-to.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

import { captureIndividualElectionRequests } from '../../helpers/election-requests.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { voteTrigger } from '../../helpers/semantic-vote.mts'

import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

test.describe('News page modal and layout checks', () => {
  let contributorId: string

  test.beforeAll(async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor) throw new Error('Failed to create news modal contributor')
    contributorId = contributor.id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, contributorId)
  })

  test('/news modal body is scrollable when content overflows', async ({ page }) => {
    await navigateTo(page, '/news')

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    await showMore.first().click()
    await page.waitForURL(/rss_item=/)

    const dialog = page.getByTestId('rss-feed-item-modal')
    await expect(dialog).toBeVisible()

    // The scroll container inside the dialog must be able to scroll if content overflows.
    // We measure the scrollHeight vs clientHeight of the Radix ScrollArea viewport.
    const scrollViewport = dialog.locator('[data-radix-scroll-area-viewport]')

    // Inject a tall spacer to force overflow so we can assert scrollability regardless of
    // article length — this avoids skipping the test due to short content.
    await scrollViewport.evaluate(viewport => {
      const spacer = document.createElement('div')
      spacer.style.height = '2000px'
      spacer.dataset.testid = 'scroll-test-spacer'
      viewport.append(spacer)
    })

    const isScrollable = await scrollViewport.evaluate(el => el.scrollHeight > el.clientHeight)

    // Content must be scrollable (scrollHeight > clientHeight) AND the viewport must not
    // overflow its container (i.e. the dialog is not taller than 85vh).
    expect(isScrollable).toBe(true)
    const dialogBox = await dialog.boundingBox()
    const viewportHeight = page.viewportSize()?.height ?? 800
    expect(requireTestValue(dialogBox, 'Expected news dialog box').height).toBeLessThanOrEqual(
      viewportHeight * 0.9,
    )
  })

  test('/news modal nav buttons are not inside the scroll area', async ({ page }) => {
    await navigateTo(page, '/news')

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    await showMore.first().click()
    await page.waitForURL(/rss_item=/)

    const dialog = page.getByTestId('rss-feed-item-modal')
    await expect(dialog).toBeVisible()

    const prevButton = page.getByTestId('rss-feed-item-modal-previous-button')
    await expect(prevButton).toBeVisible()

    // The Previous button must NOT be inside the Radix ScrollArea viewport
    const isInsideScrollArea = await prevButton.evaluate(el => {
      const scrollViewport = el.closest('[data-radix-scroll-area-viewport]')
      return scrollViewport !== null
    })
    expect(isInsideScrollArea).toBe(false)
  })

  test('opening modal does not shift page layout horizontally', async ({ page }) => {
    await navigateTo(page, '/news')

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    // Measure page width before opening modal
    const widthBefore = await page.evaluate(() => document.documentElement.clientWidth)

    await showMore.first().click()
    await page.waitForURL(/rss_item=/)
    await expect(page.getByTestId('rss-feed-item-modal')).toBeVisible()

    // Page width must remain the same (scrollbar-gutter: stable prevents shift)
    const widthAfter = await page.evaluate(() => document.documentElement.clientWidth)
    expect(widthAfter).toBe(widthBefore)
  })

  test('/news modal shows source badge and published date matching the card', async ({ page }) => {
    await navigateTo(page, '/news')

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    await showMore.first().click()
    await page.waitForURL(/rss_item=/)

    const dialog = page.getByTestId('rss-feed-item-modal')
    await expect(dialog).toBeVisible()

    // Modal must show the source badge (same as the card's source-badge-link)
    await expect(dialog.getByTestId('source-badge-link')).toBeVisible()

    // Modal must show a published date in the format "Jan 1, 2025"
    const datePattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{1,2},\s\d{4}/
    const dialogText = await dialog.innerText()
    expect(dialogText).toMatch(datePattern)
  })

  test('/news modal Previous/Next button focus follows navigation direction', async ({ page }) => {
    await navigateTo(page, '/news')

    const cards = page.getByTestId('news-item-card')
    await expect
      .poll(() => cards.count(), {
        message: 'seeded news articles should support prev/next navigation',
      })
      .toBeGreaterThanOrEqual(2)

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    // Open the first modal
    await showMore.first().click()
    await page.waitForURL(/rss_item=/)

    const dialog = page.getByTestId('rss-feed-item-modal')
    await expect(dialog).toBeVisible()

    const nextButton = page.getByTestId('rss-feed-item-modal-next-button')
    const isNextEnabled = (await nextButton.getAttribute('aria-disabled')) !== 'true'
    expect(isNextEnabled, 'seeded modal should have a next item').toBe(true)

    // Capture URL before navigating so we can wait for the async navigation to complete.
    // ArrowRight/ArrowLeft each trigger router.push(), which is async — pressing the next
    // key before the URL has changed causes a race: the rAF focus-recovery effect from
    // the first navigation can overwrite the focus set by the second keypress.
    const urlBeforeNext = page.url()

    // Press ArrowRight — triggers navigateNext() -> router.push() -> URL change
    await page.keyboard.press('ArrowRight')

    // Wait for the first navigation to complete before pressing ArrowLeft
    await expect(page).not.toHaveURL(urlBeforeNext)

    // After navigation + rAF focus recovery, Next button should be focused
    await expect(nextButton).toBeFocused()

    const urlBeforePrev = page.url()

    // Press ArrowLeft — triggers navigatePrevious() -> router.push() back to original item
    await page.keyboard.press('ArrowLeft')

    // Wait for the second navigation to complete
    await expect(page).not.toHaveURL(urlBeforePrev)

    // After navigating back to the first item, Previous is semantically disabled
    // and cannot receive keyboard focus.
    const prevButton = page.getByTestId('rss-feed-item-modal-previous-button')
    await expect(prevButton).toBeDisabled()
    await expect(prevButton).not.toBeFocused()
  })

  test('/news list shows semantic voting on a news item', async ({ page }) => {
    await navigateTo(page, '/news')

    // Election summaries are loaded as rss_feed_item_elections sidecars in the
    // same /api/v1/rss-feed-items response, so no per-item election fetch is needed.
    await expect(voteTrigger(page, 'news-item-vote').first()).toBeVisible()
  })

  test('/news does not request individual election endpoints in the browser', async ({ page }) => {
    const individualElectionRequests = captureIndividualElectionRequests(page)

    await navigateTo(page, '/news')

    const cards = page.getByTestId('news-item-card')
    await expect
      .poll(() => cards.count(), { message: 'seeded news articles should be visible' })
      .toBeGreaterThan(0)

    await expect(voteTrigger(page, 'news-item-vote').first()).toBeVisible()
    expect(individualElectionRequests).toEqual([])
  })

  test('/news modal footer shows semantic voting', async ({ page }) => {
    await navigateTo(page, '/news')

    const showMore = page.getByTestId('news-item-show-more-link')
    await expect
      .poll(() => showMore.count(), {
        message: 'seeded news articles with excerpts should be visible',
      })
      .toBeGreaterThan(0)

    // Every item has an election sidecar (defaults to 0 counts), so any item's
    // modal will show semantic voting — no need to find the specific seeded item.
    await showMore.first().click()
    await page.waitForURL(/rss_item=/)

    const dialog = page.getByTestId('rss-feed-item-modal')
    await expect(dialog).toBeVisible()

    await expect(voteTrigger(dialog, 'news-item-modal-vote')).toBeVisible()
  })
})
