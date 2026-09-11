import { test, expect, type Locator, type Page } from '../../helpers/test.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { linkTopicHostname } from '../../helpers/link-topic-hostname.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
// Seeded topic with an RSS feed (topic_type = 'card'). Read-only — never mutate.
const SEEDED_TOPIC_ID = '019c64e6-f8a0-7000-a000-000000000001'
const SEEDED_TOPIC_TYPE = 'card'

test.describe('Admin Manage Source', () => {
  test.use({ storageState: AUTH_STATE })
  test.describe.configure({ mode: 'serial' })

  let topicId: string
  let topicType: string

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `Manage Source Test Topic ${suffix}`,
      `manage-source-test-${suffix}`,
    )
    topicId = topic.id
    topicType = topic.urlSlug
    await linkTopicHostname(topic.id, `manage-source-${suffix}.example.com`)
  })

  test('should redirect unauthenticated users to home', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/${SEEDED_TOPIC_TYPE}/${SEEDED_TOPIC_ID}/settings/domains`)
    await expect(page).toHaveURL('/')
  })

  test('should show domains section when topic has no RSS feed', async ({ page }) => {
    await navigateTo(page, `/${topicType}/${topicId}/settings/domains`)

    await expect(page.getByTestId('topic-settings-domains')).toBeVisible()
    await expect(page.getByTestId('domains-heading')).toBeVisible()
    await expect(page.getByTestId('topic-detail-tab-settings')).toBeVisible()
  })

  test('should show domains section', async ({ page }) => {
    await navigateTo(page, `/${topicType}/${topicId}/settings/domains`)

    await expect(page.getByTestId('domains-heading')).toBeVisible()
    await expect(page.getByTestId('primary-domain-heading')).toBeVisible()
    await expect(page.getByTestId('additional-domains-heading')).toBeVisible()
  })

  test('should save primary domain', async ({ page }) => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `Primary Domain Test Topic ${suffix}`,
      `primary-domain-test-${suffix}`,
    )

    await navigateTo(page, `/${topic.urlSlug}/${topic.id}/settings/domains`)
    await expect(page.getByTestId('primary-domain-heading')).toBeVisible()

    const newHostname = `primary-domain-new-${suffix}.example.com`
    const primaryDomainInput = page.getByTestId('primary-domain-input')
    await primaryDomainInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await primaryDomainInput.fill(newHostname)
    const saveButton = page.getByTestId('primary-domain-save')
    await clickAfterBelowFoldHydration(page, saveButton)

    await expect(
      page
        .locator('[data-sonner-toast]')
        .filter({ hasText: `Primary domain set to ${newHostname}` }),
    ).toBeVisible()
  })

  test('should add and remove additional domain', async ({ page }) => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `Additional Domain Test Topic ${suffix}`,
      `additional-domain-test-${suffix}`,
    )
    await linkTopicHostname(topic.id, `add-domain-primary-${suffix}.example.com`)

    await navigateTo(page, `/${topic.urlSlug}/${topic.id}/settings/domains`)
    await expect(page.getByTestId('additional-domains-heading')).toBeVisible()
    await expect(page.getByTestId('additional-domains-empty')).toBeVisible()

    const additionalHostname = `add-domain-extra-${suffix}.example.com`
    const additionalDomainInput = page.getByTestId('additional-domain-input')
    await additionalDomainInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await additionalDomainInput.fill(additionalHostname)
    await clickAfterBelowFoldHydration(page, page.getByTestId('add-domain-submit'))

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: `Added ${additionalHostname}` }),
    ).toBeVisible()
    await expect(page.getByTestId(`additional-domain-row-${additionalHostname}`)).toBeVisible()

    // Remove it
    await clickAfterBelowFoldHydration(
      page,
      page.getByTestId(`additional-domain-remove-${additionalHostname}`),
    )
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: `Removed ${additionalHostname}` }),
    ).toBeVisible()
    await expect(page.getByTestId('additional-domains-empty')).toBeVisible()
  })

  test('should update an RSS feed', async ({ page }) => {
    // Create a fresh topic + RSS feed so we can mutate the title without
    // touching the seeded entity (which other tests rely on).
    const suffix = randomSuffix()
    const { id: updateTopicId, urlSlug: updateTopicSlug } = await insertTestTopic(
      `Update Feed Test Topic ${suffix}`,
      `update-feed-test-${suffix}`,
      'rss_feed',
    )
    await insertTestRssFeed(updateTopicId, `update-feed-${suffix}`)

    await navigateTo(page, `/${updateTopicSlug}/${updateTopicId}/settings/source`)

    await expect(page.getByTestId('topic-settings-source')).toBeVisible()
    await expect(page.getByTestId('update-source-heading')).toBeVisible()

    // Keep the updated title deterministic so the visual snapshot below stays
    // stable. Uniqueness is provided by the per-test topic + RSS feed created
    // above; the title field itself does not need to be randomized.
    const updatedTitle = 'Updated Test Feed Title'
    const titleInput = page.getByTestId('source-title-input')
    await titleInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await titleInput.fill(updatedTitle)

    await clickAfterBelowFoldHydration(page, page.getByTestId('update-source-submit'))

    await expect(titleInput).toHaveValue(updatedTitle)
  })

  test('should update an RSS feed source URL', async ({ page }) => {
    const suffix = randomSuffix()
    const { id: updateTopicId, urlSlug: updateTopicSlug } = await insertTestTopic(
      `Update Feed URL Test Topic ${suffix}`,
      `update-feed-url-test-${suffix}`,
      'rss_feed',
    )
    await insertTestRssFeed(updateTopicId, `update-feed-url-${suffix}`)

    await navigateTo(page, `/${updateTopicSlug}/${updateTopicId}/settings/source`)
    await expect(page.getByTestId('update-source-heading')).toBeVisible()

    const sourceUrlInput = page.getByTestId('source-url-input')
    const updatedUrl = `https://update-feed-url-new-${suffix}.example.com/feed.xml`
    await sourceUrlInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await sourceUrlInput.fill(updatedUrl)
    await clickAfterBelowFoldHydration(page, page.getByTestId('update-source-submit'))

    await expect(sourceUrlInput).toHaveValue(updatedUrl)
  })

  test('should enable and disable an RSS feed', async ({ page }) => {
    // Insert a fresh RSS feed to toggle
    const suffix = randomSuffix()
    const { id: feedTopicId, urlSlug: feedTopicSlug } = await insertTestTopic(
      `Toggle Test Topic ${suffix}`,
      `toggle-test-${suffix}`,
      'rss_feed',
    )
    await insertTestRssFeed(feedTopicId, `toggle-${suffix}`)

    await navigateTo(page, `/${feedTopicSlug}/${feedTopicId}/settings/source`)
    await expect(page.getByTestId('update-source-heading')).toBeVisible()

    // Should initially be enabled (Metadata shows "Enabled")
    await expect(page.getByTestId('feed-status')).toHaveText('Enabled')

    // Click Disable
    await clickAfterBelowFoldHydration(page, page.getByTestId('feed-disable'))
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Source disabled' }),
    ).toBeVisible()

    // Click Enable
    await clickAfterBelowFoldHydration(page, page.getByTestId('feed-enable'))
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Source enabled' }),
    ).toBeVisible()
  })

  test('should toggle discovery visibility on and off', async ({ page }) => {
    const suffix = randomSuffix()
    const { id: discoveryTopicId, urlSlug: discoveryTopicSlug } = await insertTestTopic(
      `Discovery Test Topic ${suffix}`,
      `discovery-test-${suffix}`,
      'rss_feed',
    )
    await insertTestRssFeed(discoveryTopicId, `discovery-${suffix}`)

    await navigateTo(page, `/${discoveryTopicSlug}/${discoveryTopicId}/settings/source`)
    await expect(page.getByTestId('update-source-heading')).toBeVisible()

    // Initially discoverable
    await expect(page.getByTestId('feed-discoverability')).toHaveText('Discoverable')

    await clickAfterBelowFoldHydration(page, page.getByTestId('feed-hide-discovery'))
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Source hidden from discovery' }),
    ).toBeVisible()
    await expect(page.getByTestId('feed-make-discoverable')).toBeVisible()

    await clickAfterBelowFoldHydration(page, page.getByTestId('feed-make-discoverable'))
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Source made discoverable' }),
    ).toBeVisible()
    await expect(page.getByTestId('feed-hide-discovery')).toBeVisible()
  })

  test('should delete an RSS feed with confirmation', async ({ page }) => {
    // Insert a fresh topic + RSS feed to delete
    const suffix = randomSuffix()
    const { id: deleteTopicId, urlSlug: deleteTopicSlug } = await insertTestTopic(
      `Delete Test Topic ${suffix}`,
      `delete-test-${suffix}`,
      'rss_feed',
    )
    await insertTestRssFeed(deleteTopicId, `delete-${suffix}`)

    await navigateTo(page, `/${deleteTopicSlug}/${deleteTopicId}/settings/source`)
    await expect(page.getByTestId('update-source-heading')).toBeVisible()

    // Click Delete to show confirmation
    await clickAfterBelowFoldHydration(page, page.getByTestId('feed-delete'))
    await expect(page.getByTestId('feed-delete-confirm-row')).toContainText('Are you sure?')

    // Confirm delete
    await clickAfterBelowFoldHydration(page, page.getByTestId('feed-delete-confirm'))
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Source deleted' }),
    ).toBeVisible()

    // Should return to empty state (no feed linked)
    await expect(page.getByTestId('source-heading')).toBeVisible()
  })

  test('settings dropdown is visible for admins on topic detail page', async ({ page }) => {
    await navigateTo(page, `/${SEEDED_TOPIC_TYPE}/${SEEDED_TOPIC_ID}`)

    await expect(page.getByTestId('topic-detail-tab-settings')).toBeVisible()
    await page.getByTestId('topic-detail-tab-settings').click()
    await expect(page.getByTestId('settings-tab-about')).toBeVisible()
    await expect(page.getByTestId('settings-tab-aliases')).toBeVisible()
  })

  test('settings dropdown is hidden for non-admin users', async ({ page }) => {
    // Not logged in
    await page.context().clearCookies()
    await navigateTo(page, `/${SEEDED_TOPIC_TYPE}/${SEEDED_TOPIC_ID}`)

    await expect(page.getByTestId('topic-detail-tab-settings')).toBeHidden()
  })

  test('topic settings dropdown appears on settings page', async ({ page }) => {
    await navigateTo(page, `/${SEEDED_TOPIC_TYPE}/${SEEDED_TOPIC_ID}/settings/about`)

    await expect(page.getByTestId('topic-detail-tab-settings')).toBeVisible()
    // RSS Feed heading should be gone from edit page
    await expect(
      page.getByRole('heading', { level: 2 }).filter({ hasText: /^RSS Feed$/ }),
    ).toBeHidden()
  })
})

async function clickAfterBelowFoldHydration(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded()
  await waitForBelowFoldHydration(page)
  await locator.click()
}
