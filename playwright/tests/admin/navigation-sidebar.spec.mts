import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

const DESKTOP_VIEWPORT = { width: 1280, height: 720 }

async function ensureSidebarOpen(page: Parameters<typeof navigateTo>[0]) {
  const sidebarPeer = page.getByTestId('sidebar-peer')
  if ((await sidebarPeer.getAttribute('data-state')) !== 'expanded') {
    await page.getByTestId('sidebar-trigger').click()
  }
  const sidebar = page.locator('[data-sidebar="sidebar"]')
  await expect(sidebar).toBeVisible()
  return sidebar
}

async function openSidebarAt(page: Parameters<typeof navigateTo>[0], path: string) {
  await navigateTo(page, path)
  return ensureSidebarOpen(page)
}

test.describe('Admin sidebar navigation', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
  })

  // ── Growth ────────────────────────────────────────────────────────────────

  test('renders admin growth intent section trigger', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/growth')
    await expect(sidebar.getByTestId('sidebar-group-admin-growth')).toBeVisible()
  })

  test('renders admin moderation intent section trigger', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/reports')
    await expect(sidebar.getByTestId('sidebar-group-admin-moderation')).toBeVisible()
  })

  test('renders administrator settings section trigger', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/memberships/grants')
    await expect(sidebar.getByTestId('settings-sidebar-admin-group')).toBeVisible()
  })

  test('renders admin operations and dynamic config section triggers', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/admin/queues')
    await expect(sidebar.getByTestId('sidebar-group-admin-operations')).toBeVisible()
    await expect(sidebar.getByTestId('sidebar-group-dynamic-config')).toBeVisible()
  })

  test('Growth → /growth', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/growth')
    await sidebar.getByTestId('sidebar-link-growth').click()
    await expect(page).toHaveURL(/\/growth/)
    await expect(page.getByTestId('growth-dashboard-heading')).toBeVisible()
  })

  // ── Product-admin intents ─────────────────────────────────────────────────

  test('Web Search: URLs → /urls', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/domains')
    await sidebar.getByTestId('sidebar-nav-urls').click()
    await expect(page).toHaveURL(/\/urls/)
    await expect(page.getByTestId('page-header-title').filter({ hasText: 'URLs' })).toBeVisible()
  })

  test('Moderation: Review Queue → /posts/review-queue', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/reports')
    await sidebar.getByTestId('sidebar-link-review-queue').click()
    await expect(page).toHaveURL(/\/posts\/review-queue/)
    await expect(page.getByTestId('review-queue-heading')).toBeVisible()
  })

  test('Topics: Create Topic → /topics/create', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/topics')
    await sidebar.getByTestId('sidebar-nav-create-topic').click()
    await expect(page).toHaveURL(/\/topics\/create/)
    await expect(page.getByTestId('create-topic-heading')).toBeVisible()
  })

  test('Topics: Topic Aliases → /topics/aliases', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/topics')
    await sidebar.getByTestId('sidebar-nav-topic-aliases').click()
    await expect(page).toHaveURL(/\/topics\/aliases/)
    await expect(page.getByTestId('topic-aliases-search-heading')).toBeVisible()
  })

  test('Posts: Curated Asides → /curated-asides', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/posts')
    await sidebar.getByTestId('sidebar-nav-curated-asides').click()
    await expect(page).toHaveURL(/\/curated-asides/)
    await expect(
      page.getByTestId('admin-page-header-title').filter({ hasText: 'Curated Asides' }),
    ).toBeVisible()
  })

  test('Moderation: Reports → /reports', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/appeals')
    await sidebar.getByTestId('sidebar-link-reports').click()
    await expect(page).toHaveURL(/\/reports/)
    await expect(page.getByTestId('reports-heading')).toBeVisible()
  })

  test('Moderation: Appeals → /appeals', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/reports')
    await sidebar.getByTestId('sidebar-link-appeals').click()
    await expect(page).toHaveURL(/\/appeals/)
    await expect(page.getByTestId('appeals-heading')).toBeVisible()
  })

  // ── Settings administration ──────────────────────────────────────────────

  test('Settings: Memberships → /memberships/grants', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/memberships/grants')
    await sidebar.getByTestId('sidebar-link-memberships').click()
    await expect(page).toHaveURL(/\/memberships\/grants/)
    await expect(page.getByTestId('memberships-admin-heading')).toBeVisible()
  })

  test('Support: Support → /support', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/support')
    await sidebar.getByTestId('sidebar-link-support').click()
    await expect(page).toHaveURL(/\/support/)
    await expect(
      page.getByTestId('admin-page-header-title').filter({ hasText: 'Support Threads' }),
    ).toBeVisible()
  })

  test('Support: Support Contacts → /support/contacts', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/support')
    await sidebar.getByTestId('sidebar-link-support-contacts').click()
    await expect(page).toHaveURL(/\/support\/contacts/)
    await expect(
      page.getByTestId('admin-page-header-title').filter({ hasText: 'Support Contacts' }),
    ).toBeVisible()
  })

  // ── Engineering ───────────────────────────────────────────────────────────

  test('Engineering: Queues → /admin/queues', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/admin/queues')
    await sidebar.getByTestId('sidebar-link-queues').click()
    await expect(page).toHaveURL(/\/admin\/queues$/)
    await expect(page.getByTestId('queues-heading')).toBeVisible()
  })

  test('Engineering: PostgreSQL → /admin/postgresql', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/admin/queues')
    await sidebar.getByTestId('sidebar-link-postgresql').click()
    await expect(page).toHaveURL(/\/admin\/postgresql/)
    await expect(page.getByTestId('postgresql-heading')).toBeVisible()
  })

  test('Engineering: Valkey → /admin/valkey', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/admin/queues')
    await sidebar.getByTestId('sidebar-link-valkey').click()
    await expect(page).toHaveURL(/\/admin\/valkey/)
    await expect(page.getByTestId('valkey-heading')).toBeVisible()
  })

  test('Engineering: Dynamic Config → /admin/dynamic-config', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/admin/queues')
    await sidebar.getByTestId('sidebar-link-admin-dynamic-config').click()
    await expect(page).toHaveURL(/\/admin\/dynamic-config/)
    await expect(page.getByTestId('dynamic-config-heading')).toBeVisible()
  })

  test('Moderation: Vote Integrity → /vote-integrity/flags', async ({ page }) => {
    const sidebar = await openSidebarAt(page, '/reports')
    await sidebar.getByTestId('sidebar-link-vote-integrity').click()
    await expect(page).toHaveURL(/\/vote-integrity\/flags/)
    await expect(page.getByTestId('vote-integrity-flags-heading')).toBeVisible()
  })
})
