import { test, expect, type Locator, type Page } from '../../helpers/test.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

// Seeded topic for read-only tests
const SEEDED_TOPIC_ID = '019c64e6-f710-74cb-b36d-130af8ff1067'
const SEEDED_TOPIC_TYPE = 'card'

test.describe('Topic Aliases', () => {
  test.use({ storageState: AUTH_STATE })
  test.describe.configure({ mode: 'serial' })

  let topicId: string
  let topicType: string

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(`Alias Test Topic ${suffix}`, `alias-test-topic-${suffix}`)
    topicId = topic.id
    topicType = topic.urlSlug
  })

  test('should redirect unauthenticated users to home for aliases search', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/topics/aliases')
    await expect(page).toHaveURL('/')
  })

  test('should allow admin to access aliases search page', async ({ page }) => {
    await navigateTo(page, '/topics/aliases')

    await expect(page.getByTestId('topic-aliases-search-heading')).toContainText('Topic Aliases')
    await expect(page.getByTestId('client-search-input')).toBeVisible()
  })

  test('should search aliases and show results', async ({ page }) => {
    const alias = `pw-alias-search-${randomSuffix()}`

    await navigateTo(page, `/${topicType}/${topicId}/settings/aliases`)
    const aliasesInput = page.getByTestId('aliases-input')
    await aliasesInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await aliasesInput.fill(alias)
    await clickAfterHydration(page, page.getByTestId('add-aliases-submit'))
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Aliases added' }),
    ).toBeVisible()

    await navigateTo(page, '/topics/aliases')
    const searchInput = page.getByTestId('client-search-input')
    await searchInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await searchInput.pressSequentially(alias)
    await page.evaluate(() => {
      ;(window as typeof window & { __clientSearchMarker?: string }).__clientSearchMarker =
        'topic-aliases-search'
    })
    await page.getByTestId('client-search-submit').click()

    await expect(page).toHaveURL(new RegExp(`/topics/aliases\\?q=${alias}`))
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as typeof window & { __clientSearchMarker?: string }).__clientSearchMarker,
        ),
      )
      .toBe('topic-aliases-search')
    await expect(page.locator('table')).toBeVisible()
  })

  test('should redirect unauthenticated users to home for topic aliases page', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/${SEEDED_TOPIC_TYPE}/${SEEDED_TOPIC_ID}/settings/aliases`)
    await expect(page).toHaveURL('/')
  })

  test('should allow admin to view topic aliases page', async ({ page }) => {
    await navigateTo(page, `/${SEEDED_TOPIC_TYPE}/${SEEDED_TOPIC_ID}/settings/aliases`)

    await expect(page.getByTestId('current-aliases-heading')).toContainText('Current Aliases')
    // Scope to breadcrumb nav to avoid strict mode violation (topic name appears in breadcrumb + subtitle)
    await expect(page.locator('nav[aria-label*="breadcrumb" i]')).toContainText(
      'Chase Sapphire Preferred',
    )
    await expect(page.getByTestId('add-aliases-heading')).toBeVisible()
  })

  test('should add an alias', async ({ page }) => {
    await navigateTo(page, `/${topicType}/${topicId}/settings/aliases`)

    const testAlias = `pw-test-alias-add-${randomSuffix()}`
    const aliasesInput = page.getByTestId('aliases-input')
    await aliasesInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await aliasesInput.fill(testAlias)

    await clickAfterHydration(page, page.getByTestId('add-aliases-submit'))

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Aliases added' }),
    ).toBeVisible()
    await expect(page.getByTestId(`alias-row-${testAlias}`)).toBeVisible()
  })

  test('should remove an alias', async ({ page }) => {
    await navigateTo(page, `/${topicType}/${topicId}/settings/aliases`)

    const testAlias = `pw-test-alias-remove-${randomSuffix()}`
    const aliasesInput = page.getByTestId('aliases-input')
    await aliasesInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await aliasesInput.fill(testAlias)
    await clickAfterHydration(page, page.getByTestId('add-aliases-submit'))
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Aliases added' }),
    ).toBeVisible()
    await expect(page.getByTestId(`alias-row-${testAlias}`)).toBeVisible()

    await clickAfterHydration(page, page.getByTestId(`alias-remove-${testAlias}`))

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: `Alias "${testAlias}" removed` }),
    ).toBeVisible()
    await expect(page.getByTestId(`alias-row-${testAlias}`)).toBeHidden()
  })

  test('should navigate to topic aliases page from aliases search results', async ({ page }) => {
    const alias = `pw-alias-link-${randomSuffix()}`

    // Add an alias so it shows up in search
    await navigateTo(page, `/${topicType}/${topicId}/settings/aliases`)
    const aliasesInput = page.getByTestId('aliases-input')
    await aliasesInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await aliasesInput.fill(alias)
    await clickAfterHydration(page, page.getByTestId('add-aliases-submit'))
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Aliases added' }),
    ).toBeVisible()

    // Search for the alias and click "Edit Aliases"
    await navigateTo(page, '/topics/aliases')
    const searchInput = page.getByTestId('client-search-input')
    await searchInput.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await searchInput.pressSequentially(alias)
    await page.getByTestId('client-search-submit').click()

    const editAliasesLink = page.locator('a').filter({ hasText: 'Edit Aliases' }).first()
    await editAliasesLink.click()

    // Should navigate to the topic aliases management page
    await expect(page).toHaveURL(new RegExp(`/${topicType}/.+/settings/aliases$`))
  })

  test('should show merge page with form elements', async ({ page }) => {
    await navigateTo(page, `/${SEEDED_TOPIC_TYPE}/${SEEDED_TOPIC_ID}/settings/merge`)

    await expect(page.getByTestId('topic-settings-merge')).toBeVisible()
    await expect(page.getByTestId('merge-topic-confirmation-input')).toBeVisible()
    await expect(page.getByTestId('merge-topic-submit')).toBeVisible()
    // Submit must be disabled until both fields are filled
    await expect(page.getByTestId('merge-topic-submit')).toBeDisabled()
  })

  test('should open settings dropdown from aliases page', async ({ page }) => {
    await navigateTo(page, `/${SEEDED_TOPIC_TYPE}/${SEEDED_TOPIC_ID}/settings/aliases`)

    await page.getByTestId('topic-detail-tab-settings').click()
    await expect(page.getByTestId('settings-tab-about')).toBeVisible()
    await page.getByTestId('settings-tab-about').click()
    await expect(page).toHaveURL(new RegExp(`/${SEEDED_TOPIC_TYPE}/.+/settings/about$`))
  })
})

async function clickAfterHydration(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded()
  await waitForBelowFoldHydration(page)
  await locator.click()
}
