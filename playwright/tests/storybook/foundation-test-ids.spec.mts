import { expect, test } from '../../helpers/test.mts'
import { navigateTo, storybookBundleHasStory } from 'vouchington-tooling/playwright'

type StoryPage = Parameters<typeof navigateTo>[0]

async function openStory(page: StoryPage, id: string) {
  expect(await storybookBundleHasStory(page, id), `Storybook bundle is missing ${id}.`).toBe(true)
  await navigateTo(page, `/storybook/iframe.html?id=${id}&viewMode=story`)
}

test.describe('Storybook shared interactive test ids', () => {
  test('auth steps expose their action buttons', async ({ page }) => {
    await openStory(page, 'auth-login-code-step--ready')
    await expect(page.getByTestId('login-code-step-resend-code')).toBeAttached()

    await openStory(page, 'auth-mfa-step--authenticator-or-passkey')
    await expect(page.getByTestId('mfa-step-continue')).toBeAttached()
  })

  test('asides expose their calls to action', async ({ page }) => {
    await openStory(page, 'entities-asides--all-asides')
    await expect(page.getByTestId('dismissible-cta-aside-action').first()).toBeAttached()
    await expect(page.getByTestId('recommended-topics-aside-content-follow').first()).toBeAttached()
    await expect(
      page.getByTestId('recommended-topics-aside-content-dismiss').first(),
    ).toBeAttached()
  })

  test('follower sharing exposes its controls', async ({ page }) => {
    await openStory(page, 'shared-follower-share-action-buttons--expanded')
    await expect(
      page.getByTestId('follower-share-action-buttons-share-with-followers'),
    ).toBeAttached()
    await expect(page.getByTestId('follower-share-action-buttons-send-to-followers')).toBeAttached()

    await openStory(page, 'shared-follower-send-dialog--selected-followers')
    await expect(page.getByTestId('follower-send-dialog-cancel')).toBeAttached()
    await expect(
      page.getByTestId('follower-send-selected-badges-remove-follower').first(),
    ).toBeAttached()
  })

  test('embed previews expose the open source links', async ({ page }) => {
    await openStory(page, 'shared-embed-preview-card--video-player')
    await expect(page.getByTestId('embed-preview-card-player-open-source')).toBeAttached()

    await openStory(page, 'shared-embed-preview-card--compact')
    await expect(page.getByTestId('embed-preview-card-open-source')).toBeAttached()
  })

  test('paginated lists expose the load more button', async ({ page }) => {
    await openStory(page, 'shared-infinite-scroll--more-available')
    await expect(page.getByTestId('paginated-list-footer-load-more')).toBeAttached()
  })

  test('tag management dialog exposes its trigger and manage link', async ({ page }) => {
    await openStory(page, 'tags-manage-tags-dialog--related-topics')
    await page.getByTestId('manage-tags-dialog-trigger').click()
    await expect(page.getByTestId('manage-tags-dialog-manage-all-tags')).toBeVisible()
  })

  test('landing page and source lists expose their outbound links', async ({ page }) => {
    await openStory(page, 'landing-pages-public-landing-page-topic-group--sapphire-reserve')
    await expect(page.getByTestId('public-landing-page-referral-link').first()).toBeAttached()

    await openStory(page, 'entities-sources--list-page')
    await expect(page.getByTestId('source-list-item-homepage').first()).toBeAttached()
  })

  test('video, membership, and referral click stories expose outbound links', async ({ page }) => {
    await openStory(page, 'feed-video-embed--external-link')
    await expect(page.getByTestId('video-embed-watch-on-platform')).toBeAttached()

    await openStory(page, 'memberships-membership-status--managed-by-app-store')
    await expect(page.getByTestId('membership-status-manage-billing')).toBeAttached()

    await openStory(page, 'my-referral-clicks-page--with-clicks')
    await expect(page.getByTestId('referral-clicks-landing-url').first()).toBeAttached()
  })

  test('community onboarding checklist exposes its go links', async ({ page }) => {
    await openStory(page, 'entities-communities-onboardingchecklist--all-incomplete')
    await expect(page.getByTestId('community-onboarding-checklist-go').first()).toBeAttached()
  })

  test('copyright notice stories expose hosted material links', async ({ page }) => {
    await openStory(page, 'copyright-staff-territorial-notice--undecided-notice')
    await expect(page.getByTestId('copyright-staff-territorial-hosted-use-url')).toBeAttached()

    await openStory(page, 'copyright-email-original-download--available')
    await expect(page.getByTestId('copyright-email-original-download')).toHaveAttribute(
      'download',
      '',
    )

    await openStory(page, 'copyright-eu-notice-detail--with-hosted-material')
    await expect(page.getByTestId('copyright-eu-notice-hosted-use-url').first()).toBeAttached()
  })

  test('new coverage stories render their controls', async ({ page }) => {
    await openStory(page, 'shared-follower-send-selected-badges--two-selected')
    await expect(
      page.getByTestId('follower-send-selected-badges-remove-follower').first(),
    ).toBeAttached()

    await openStory(page, 'copyright-notice-detail--restricted-material')
    await expect(page.getByTestId('copyright-notice-hosted-use-url')).toBeAttached()

    await openStory(page, 'copyright-repeat-infringer-account--operative-incident')
    await expect(page.getByTestId('button').first()).toBeAttached()
  })
})
