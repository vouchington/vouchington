import { test, expect, type Page } from '../../helpers/test.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

// Seeded topic for read-only tests
const SEEDED_TOPIC_ID = '019c64e6-f710-74cb-b36d-130af8ff1067'
const SEEDED_TOPIC_TYPE = 'card'

test.describe('Admin Topics Edit', () => {
  test.use({ storageState: AUTH_STATE })
  test.describe.configure({ mode: 'serial' })

  let topicId: string
  let topicType: string

  async function waitForTopicEditHydration(page: Page) {
    await page.locator('[data-hydrated="true"]').waitFor()
  }

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(`Edit Test Topic ${suffix}`, `edit-test-topic-${suffix}`)
    topicId = topic.id
    topicType = topic.urlSlug
  })

  test('should redirect unauthenticated users to home', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/${SEEDED_TOPIC_TYPE}/${SEEDED_TOPIC_ID}/settings/about`)
    await expect(page).toHaveURL('/')
  })

  test('should allow admin to view settings/about page for existing topic', async ({ page }) => {
    await navigateTo(page, `/${SEEDED_TOPIC_TYPE}/${SEEDED_TOPIC_ID}/settings/about`)
    await waitForTopicEditHydration(page)

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Chase Sapphire Preferred')
    await expect(page.locator('nav[aria-label*="breadcrumb" i]')).toContainText(
      'Chase Sapphire Preferred',
    )
    await expect(page.getByTestId('topic-settings-about')).toBeVisible()
    await expect(page.getByTestId('basic-info-heading')).toBeVisible()
    await expect(page.getByTestId('topic-detail-tab-settings')).toBeVisible()
  })

  test('should show aliases in settings dropdown', async ({ page }) => {
    await navigateTo(page, `/${topicType}/${topicId}/settings/about`)
    await waitForTopicEditHydration(page)

    await page.getByTestId('topic-detail-tab-settings').click()
    await expect(page.getByTestId('settings-tab-aliases')).toBeVisible()
  })

  test('should update basic info (name and markdown)', async ({ page }) => {
    await navigateTo(page, `/${topicType}/${topicId}/settings/about`)
    await waitForTopicEditHydration(page)

    await page.getByTestId('topic-edit-name-input').fill(`Edit Test Topic ${topicId} Updated`)
    await page.getByTestId('topic-edit-markdown-input').fill('Updated markdown content for testing')

    await page.getByTestId('save-basic-info').click()

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Basic info updated' }),
    ).toBeVisible()
  })

  test('should show behavior page sections', async ({ page }) => {
    await navigateTo(page, `/${topicType}/${topicId}/settings/behavior`)
    await page.getByTestId('topic-settings-behavior').waitFor()

    await expect(page.getByTestId('topic-type-heading')).toBeVisible()
    await expect(page.getByTestId('spending-category-heading')).toBeVisible()
  })

  test('should update spending category info on behavior page', async ({ page }) => {
    await navigateTo(page, `/${topicType}/${topicId}/settings/behavior`)
    await page.getByTestId('topic-settings-behavior').waitFor()

    await page.getByTestId('default-spending-frequency-trigger').click()
    await page.getByTestId('spending-frequency-monthly').click()

    await page.getByTestId('save-spending-category').click()

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Spending category updated' }),
    ).toBeVisible()
  })
})
