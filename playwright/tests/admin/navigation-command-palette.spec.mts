import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

const DESKTOP_VIEWPORT = { width: 1280, height: 720 }

/**
 * Open the command palette, type a query, wait for the matching
 * shortcut result to appear in the "Pages" group, then click it.
 *
 * CommandItem elements have role="option" inside a CommandGroup heading
 * "Pages".
 */
async function openPaletteAndNavigate(
  page: Parameters<typeof navigateTo>[0],
  label: string,
  href?: string,
) {
  const searchButton = page.getByTestId('navbar-search-button')
  await expect(searchButton).toBeVisible()
  await waitForBelowFoldHydration(page)
  await searchButton.click()

  // Wait for the command dialog input to appear
  const input = page.getByTestId('search-input')
  await expect(input).toBeVisible()

  // Type the label to match shortcuts
  await input.pressSequentially(label)

  // Wait for the matching item inside the "Pages" group.
  // Each option renders two spans: the label (font-medium) and the href (text-xs).
  // getByRole accessible name includes both spans, so use an anchored regex on the
  // label span to avoid 'Support' matching 'Support Contacts'.
  const pagesGroup = page.locator('[cmdk-group]').filter({
    has: page.locator('[cmdk-group-heading]').filter({ hasText: 'Pages' }),
  })
  const escapedLabel = label.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  const pageOptions = href
    ? pagesGroup.locator(`[role="option"][href="${href}"]`)
    : pagesGroup.locator('[role="option"]')
  const matchingItem = pageOptions.filter({
    has: page.locator('span').filter({ hasText: new RegExp(`^${escapedLabel}$`) }),
  })
  await expect(matchingItem).toBeVisible()

  await matchingItem.click()
}

async function expectPageHeading(page: Parameters<typeof navigateTo>[0], name: string | RegExp) {
  await expect(page.getByRole('heading', { level: 1 }).filter({ hasText: name })).toBeVisible()
}

test.describe('Admin command palette navigation', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
  })

  test('Queues → /admin/queues', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Queues')
    await expect(page).toHaveURL(/\/admin\/queues$/)
    await expectPageHeading(page, 'Queues')
  })

  test('URLs → /urls', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'URLs')
    await expect(page).toHaveURL(/\/urls/)
    await expectPageHeading(page, 'URLs')
  })

  test('Agents → /agents', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Agents')
    await expect(page).toHaveURL(/\/agents/)
    await expectPageHeading(page, 'Agents')
  })

  test('PostgreSQL → /admin/postgresql', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'PostgreSQL')
    await expect(page).toHaveURL(/\/admin\/postgresql/)
    await expectPageHeading(page, 'PostgreSQL')
  })

  test('Valkey → /admin/valkey', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Valkey')
    await expect(page).toHaveURL(/\/admin\/valkey/)
    await expectPageHeading(page, 'Valkey')
  })

  test('Dynamic Config → /admin/dynamic-config', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Dynamic Config')
    await expect(page).toHaveURL(/\/admin\/dynamic-config/)
    await expect(page.getByTestId('dynamic-config-heading')).toBeVisible()
  })

  test('Memberships → /memberships/grants', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Memberships')
    await expect(page).toHaveURL(/\/memberships\/grants/)
    await expectPageHeading(page, 'Memberships Admin')
  })

  test('Vote Integrity → /vote-integrity/flags', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Vote Integrity')
    await expect(page).toHaveURL(/\/vote-integrity\/flags/)
    await expectPageHeading(page, 'Vote Integrity Flags')
  })

  test('Topic Aliases → /topics/aliases', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Topic Aliases')
    await expect(page).toHaveURL(/\/topics\/aliases/)
    await expectPageHeading(page, 'Topic Aliases')
  })

  test('CRM → /crm', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'CRM')
    await expect(page).toHaveURL(/\/crm/)
    await expectPageHeading(page, 'CRM Contacts')
  })

  test('Support → /support', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Support')
    await expect(page).toHaveURL(/\/support/)
    await expectPageHeading(page, 'Support Threads')
  })

  test('Review Queue → /posts/review-queue', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Review Queue')
    await expect(page).toHaveURL(/\/posts\/review-queue/)
    await expectPageHeading(page, 'Review Queue')
  })

  test('Create Topic → /topics/create', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Create Topic')
    await expect(page).toHaveURL(/\/topics\/create/)
    await expectPageHeading(page, 'Create Topic')
  })

  test('Create Topic shortcut has correct href for Cmd+click', async ({ page }) => {
    await navigateTo(page, '/')
    const originalUrl = page.url()

    const searchButton = page.getByTestId('navbar-search-button')
    await expect(searchButton).toBeVisible()
    await waitForBelowFoldHydration(page)
    await searchButton.click()

    const input = page.getByTestId('search-input')
    await expect(input).toBeVisible()
    await input.pressSequentially('Create Topic')
    await expect(page.getByTestId('search-page-shortcut-topics-create')).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByTestId('search-page-shortcut-topics-create')).toHaveAttribute(
      'href',
      '/topics/create',
    )

    // href already verified above — browser follows it natively on Cmd+click (no preventDefault).
    // Waiting for the popup to fully navigate to wrangler is slow under parallel test load,
    // so we only verify that a new tab opened and the original tab stayed in place.
    const popupPromise = page.context().waitForEvent('page')
    await page
      .getByTestId('search-page-shortcut-topics-create')
      .click({ modifiers: ['ControlOrMeta'] })
    const popup = await popupPromise
    await popup.close()
    // Current tab stays on the original page (not redirected by the Cmd+click)
    expect(page.url()).toBe(originalUrl)
  })

  test('Support Contacts → /support/contacts', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Support Contacts')
    await expect(page).toHaveURL(/\/support\/contacts/)
    await expectPageHeading(page, 'Support Contacts')
  })

  test('Reports → /reports', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Reports')
    await expect(page).toHaveURL(/\/reports/)
    await expect(page.getByTestId('reports-heading')).toBeVisible()
  })

  test('Appeals → /appeals', async ({ page }) => {
    await navigateTo(page, '/')
    await openPaletteAndNavigate(page, 'Appeals', '/appeals')
    await expect(page).toHaveURL(/\/appeals/)
    await expect(page.getByTestId('appeals-heading')).toBeVisible()
  })
})
