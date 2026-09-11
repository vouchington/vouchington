import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { voteChoice, voteTrigger } from '../../helpers/semantic-vote.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

// Two `<ScoreVote>` instances of the same election (the news list card and the
// "Show more" modal) must stay in sync via the in-memory `VoteStoreProvider`.
// When the user votes on one surface, the other surface must reflect the same
// selected semantic choice without a refetch.
test.describe('Vote sync between card and modal', () => {
  let contributorId: string

  test.beforeAll(async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor) throw new Error('Failed to create vote sync contributor')
    contributorId = contributor.id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, contributorId)
  })

  test('Vouch on card propagates to modal; Dislike in modal propagates back', async ({ page }) => {
    await navigateTo(page, '/news')

    const cardTrigger = voteTrigger(page, 'news-item-vote').first()
    await expect(cardTrigger).toBeVisible()

    const vouchRequest = page.waitForResponse(
      response =>
        /\/api\/v1\/rss-feed-items\/[^/]+\/vote/.test(response.url()) && response.status() < 400,
    )
    await cardTrigger.click()
    await voteChoice(page, 'news-item-vote', 'vouch').click()
    await vouchRequest
    await expect(cardTrigger).toContainText('Vouch')

    // Step 2: open the modal via the cluster's "Show more" link.
    await page.getByTestId('news-item-show-more-link').first().click()
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    const modalTrigger = voteTrigger(modal, 'news-item-modal-vote')

    // Step 3: modal hydrates from the shared store, not from a stale prop.
    await expect(modalTrigger).toContainText('Vouch')

    const dislikeRequest = page.waitForResponse(
      response =>
        /\/api\/v1\/rss-feed-items\/[^/]+\/vote/.test(response.url()) && response.status() < 400,
    )
    await modalTrigger.click()
    await voteChoice(page, 'news-item-modal-vote', 'dislike').click()
    await dislikeRequest
    await expect(modalTrigger).toContainText('Dislike')

    // Step 5: close the modal (Radix Dialog sets aria-hidden on the background,
    // so we must close before querying the card's buttons via role selectors).
    // The VoteStoreProvider lives at the root layout and survives the navigation,
    // so the card should still reflect the downvoted state from the shared store.
    await modal.getByRole('button', { name: 'Close' }).click()
    await expect(modal).toBeHidden()
    await expect(cardTrigger).toContainText('Dislike')
  })
})

// Vote buttons must not visually dim (opacity) while the PUT request is in flight.
// The store applies the optimistic state immediately on click, so the in-flight period
// must be visually identical to the resolved state (no flicker).
test.describe('Vote button no-flicker invariant', () => {
  let contributorId: string

  test.beforeAll(async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor) throw new Error('Failed to create vote no-flicker contributor')
    contributorId = contributor.id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, contributorId)
  })

  test('semantic trigger stays at full opacity during in-flight vote', async ({ page }) => {
    await navigateTo(page, '/news')

    // Intercept the vote PUT so we can inspect the button while the request is in flight.
    let releaseRequest!: () => void
    await page.route(/\/api\/v1\/rss-feed-items\/[^/]+\/vote/, async route => {
      await new Promise<void>(resolve => {
        releaseRequest = resolve
      })
      await route.continue()
    })

    const trigger = voteTrigger(page, 'news-item-vote').first()
    await expect(trigger).toBeVisible()

    await trigger.click()
    await voteChoice(page, 'news-item-vote', 'vouch').click()

    // While the PUT is still in flight: button must be disabled (double-submit guard)
    // but visually at full opacity (no dim/flicker).
    await expect(trigger).toBeDisabled()
    const opacity = await trigger.evaluate(el => getComputedStyle(el).opacity)
    expect(opacity).toBe('1')

    // Release the intercepted request so the page can settle.
    releaseRequest()
    await expect(trigger).toBeEnabled()
  })
})
