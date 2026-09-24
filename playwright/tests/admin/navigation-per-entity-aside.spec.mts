import { test, expect } from '../../helpers/test.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { insertTestSupportContact } from '../../../backend/test-helpers/entities/support-contacts.mts'
import { insertTestSupportThread } from '../../../backend/test-helpers/entities/support-threads.mts'

const DESKTOP_VIEWPORT = { width: 1280, height: 720 }
const SEEDED_TOPIC_ID = '019c64e6-f710-74cb-b36d-130af8ff1067'
const SEEDED_TOPIC_PATH = `/card/${SEEDED_TOPIC_ID}`

// ── Section A: Settings dropdown (replaces removed TopicAdminAside) ─────────

test.describe('Settings dropdown links', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
  })

  test('Settings dropdown trigger is visible in topic menubar for admins', async ({ page }) => {
    await navigateTo(page, SEEDED_TOPIC_PATH)

    await expect(page.getByTestId('topic-detail-tab-settings')).toBeVisible()
    await page.getByTestId('topic-detail-tab-settings').click()
    await expect(page.getByTestId('settings-tab-about')).toBeVisible()
    await expect(page.getByTestId('settings-tab-aliases')).toBeVisible()
  })

  test('About sub-page navigates to settings/about', async ({ page }) => {
    await navigateTo(page, SEEDED_TOPIC_PATH)

    await page.getByTestId('topic-detail-tab-settings').click()
    await page.getByTestId('settings-tab-about').click()
    await expect(page).toHaveURL(/\/[^/]+\/[^/]+\/settings\/about/)
    await expect(page.getByTestId('basic-info-heading')).toBeVisible()
  })

  test('Domains sub-page navigates to settings/domains', async ({ page }) => {
    await navigateTo(page, SEEDED_TOPIC_PATH)

    await page.getByTestId('topic-detail-tab-settings').click()
    await page.getByTestId('settings-tab-domains').click()
    await expect(page).toHaveURL(/\/[^/]+\/[^/]+\/settings\/domains/)
    await expect(page.getByTestId('domains-heading')).toBeVisible()
  })

  test('Aliases sub-page navigates to settings/aliases', async ({ page }) => {
    await navigateTo(page, SEEDED_TOPIC_PATH)

    await page.getByTestId('topic-detail-tab-settings').click()
    await page.getByTestId('settings-tab-aliases').click()
    await expect(page).toHaveURL(/\/[^/]+\/[^/]+\/settings\/aliases/)
    await expect(page.getByTestId('current-aliases-heading')).toBeVisible()
  })
})

// ── Section B: DomainAdminDetails ──────────────────────────────────────────

test.describe('DomainAdminDetails crawler links', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
  })

  test('View crawler link navigates to /crawler/:id', async ({ page }) => {
    await navigateTo(page, '/domain/example.com')
    await expect(page.getByTestId('domain-detail-heading')).toContainText('example.com')

    const crawlersTab = page.getByTestId('domain-tab-crawlers')
    await expect(crawlersTab).toBeVisible()
    await crawlersTab.click()

    const viewLink = page.locator('[data-pw^="domain-crawler-view-"]').first()
    await expect(viewLink).toBeVisible()

    await viewLink.click()
    await expect(page).toHaveURL(/\/crawler\/[^/]+$/)
    await expect(page.getByTestId('crawler-detail-heading')).toBeVisible()
  })

  test('Edit crawler link navigates to /crawler/:id/edit', async ({ page }) => {
    await navigateTo(page, '/domain/example.com')
    await expect(page.getByTestId('domain-detail-heading')).toContainText('example.com')

    const crawlersTab = page.getByTestId('domain-tab-crawlers')
    await expect(crawlersTab).toBeVisible()
    await crawlersTab.click()

    const editLink = page.locator('[data-pw^="domain-crawler-edit-"]').first()
    await expect(editLink).toBeVisible()

    await editLink.click()
    await expect(page).toHaveURL(/\/crawler\/[^/]+\/edit$/)
    await expect(page.getByTestId('crawler-edit-heading')).toBeVisible()
  })
})

// ── Section C: Support thread ───────────────────────────────────────────────

test.describe('Admin support — per-thread navigation', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
  })

  test('first thread link navigates to /support/threads/:id', async ({ page }) => {
    const suffix = randomSuffix()
    const subject = `Playwright navigation support thread ${suffix}`
    const contact = await insertTestSupportContact({
      emailAddress: `playwright-navigation-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id, subject })

    await navigateTo(page, '/support')
    await expect(
      page.getByTestId('admin-page-header-title').filter({ hasText: 'Support Threads' }),
    ).toBeVisible()

    const threadLink = page.getByTestId(`support-thread-link-${thread.id}`)
    await expect(threadLink).toBeVisible()
    await threadLink.click()

    await expect(page).toHaveURL(/\/support\/threads\/[^/]+$/)
    await expect(page.getByTestId('support-thread-page-heading')).toContainText(subject)
  })
})

// ── Section E: Support contact detail ──────────────────────────────────────

test.describe('Admin support contacts — per-contact navigation', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
  })

  test('first contact link navigates to /support/contacts/:id', async ({ page }) => {
    await navigateTo(page, '/support/contacts?q=agent-test%40playwright.seed')
    await expect(
      page.getByTestId('admin-page-header-title').filter({ hasText: 'Support Contacts' }),
    ).toBeVisible()

    const firstContactLink = page.getByTestId(
      'support-contact-link-019d0000-0000-7000-8000-000000000006',
    )
    await expect(firstContactLink).toBeVisible()

    await firstContactLink.click()
    await expect(page).toHaveURL(/\/support\/contacts\/[^/]+$/)
    await expect(page.getByTestId('support-contact-page-heading')).toContainText(
      'agent-test@playwright.seed',
    )
  })
})

// ── Section F: Topic Aliases → per-topic aliases ────────────────────────────

test.describe('Admin topic aliases search — Edit Aliases navigation', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
  })

  test('Edit Aliases link from search results navigates to /:type/:id/aliases', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const alias = `pw-nav-alias-${suffix}`
    const topic = await insertTestTopic(
      `Navigation Alias Test Topic ${suffix}`,
      `navigation-alias-test-topic-${suffix}`,
    )

    await navigateTo(page, `/${topic.urlSlug}/${topic.id}/settings/aliases`)
    await page.getByTestId('aliases-input').pressSequentially(alias)
    await page.getByTestId('add-aliases-submit').click()
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Aliases added' }),
    ).toBeVisible()

    await navigateTo(page, '/topics/aliases')
    await expect(page.getByTestId('topic-aliases-search-heading')).toBeVisible()

    const searchInput = page.getByTestId('client-search-input')
    await expect(searchInput).toBeVisible()

    await searchInput.pressSequentially(alias)
    await page.getByTestId('client-search-submit').click()

    const editAliasesLink = page.getByTestId(`alias-search-edit-link-${alias}`)
    await expect(editAliasesLink).toBeVisible()

    await editAliasesLink.click()
    await expect(page).toHaveURL(/\/[^/]+\/[^/]+\/settings\/aliases$/)
    await expect(page.getByTestId('current-aliases-heading')).toBeVisible()
  })
})
