import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { TEST_USER_USERNAME } from '../../helpers/auth.mts'

// Seed IDs from playwright-test-data.mts
const DISCUSSION_ID = '019c64e6-f720-7001-a001-000000000001'
const TOPIC_ID = '019c64e6-f710-74cb-b36d-130af8ff1067' // Chase Sapphire Preferred (card)

// Policy: vote and follow buttons must be visible to signed-out users and link to login
// with next + intent query params.
// Hide button must NOT be visible to signed-out users.
// See docs/requirements/navigation/SIGNED_OUT_ACTIONS.md for the full matrix.

test.describe('Signed-out user action buttons', () => {
  test.describe('post (discussion)', () => {
    test('shows an intent-aware vote sign-in link; no interactive ballot buttons', async ({
      page,
    }) => {
      await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

      const signedOutVoteLinks = page.getByTestId('score-vote-sign-in')
      await expect(signedOutVoteLinks).toHaveCount(1)
      await expect(signedOutVoteLinks.first()).toBeVisible()
      await expect(signedOutVoteLinks.first()).toHaveAttribute(
        'href',
        /^\/login\?next=.+&intent=vote$/,
      )
    })
  })

  test.describe('topic detail', () => {
    test('shows Follow as /login link; vote visible', async ({ page }) => {
      await navigateTo(page, `/card/${TOPIC_ID}/discussions`)

      // Follow button is an intent-aware login link for signed-out users
      const followLink = page.getByTestId('signed-out-follow-link')
      await expect(followLink.first()).toBeVisible()
      await expect(followLink.first()).toHaveAttribute('href', /^\/login\?next=.+&intent=follow$/)

      // No interactive Follow or Subscribe buttons (signed-out users see no live buttons)
      await expect(page.getByTestId('entity-bookmark-button')).toHaveCount(0)
    })
  })

  test.describe('user profile', () => {
    test('shows Follow as /login link; no Subscribe button', async ({ page }) => {
      // Use the canonical user profile page, not /@username (which is now the bare landing page)
      await navigateTo(page, `/user/${TEST_USER_USERNAME}`)

      const followLink = page.getByTestId('signed-out-follow-link')
      await expect(followLink.first()).toBeVisible()
      await expect(followLink.first()).toHaveAttribute('href', /^\/login\?next=.+&intent=follow$/)

      await expect(page.getByTestId('user-profile-subscribe-posts-button')).toHaveCount(0)
    })
  })

  test.describe('news feed (RSS feed items)', () => {
    test('no hide button; vote sign-in links lead to login when items have elections', async ({
      page,
    }) => {
      await navigateTo(page, '/news')

      // Hide and Save buttons must NOT appear for signed-out users
      await expect(page.getByTestId('hide-button')).toHaveCount(0)
      await expect(page.getByTestId('entity-bookmark-button')).toHaveCount(0)

      // Seeded news items with elections expose an intent-aware sign-in link.
      const voteLinks = page.getByTestId('news-item-vote-sign-in')
      await expect(voteLinks).not.toHaveCount(0)
      await expect(voteLinks.first()).toHaveAttribute('href', /^\/login\?next=.+&intent=vote$/)
    })
  })
})
