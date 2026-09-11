import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

test.describe('Queue Dashboard', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/admin/queues')
  })

  test('displays page title', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Queues')
  })

  test('glidemq dashboard link points to /admin/mq-dashboard', async ({ page }) => {
    const link = page.getByTestId('glidemq-dashboard-link')
    await expect(link).toBeVisible({ timeout: 10_000 })
    await expect(link).toHaveAttribute('href', '/admin/mq-dashboard')
    await expect(link).toHaveAttribute('target', '_blank')
  })

  test('loads the GlideMQ dashboard with its fetch and SSE connections allowed by CSP', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const violations: string[] = []
      ;(window as unknown as { playwrightCspViolations: string[] }).playwrightCspViolations =
        violations
      window.addEventListener('securitypolicyviolation', event => {
        violations.push(`${event.effectiveDirective}:${event.blockedURI}`)
      })
    })
    await page.route('https://fonts.googleapis.com/**', route =>
      route.fulfill({ contentType: 'text/css', body: '' }),
    )
    const queuesResponse = page.waitForResponse(response =>
      response.url().endsWith('/admin/mq-dashboard/api/queues'),
    )
    const eventsResponse = page.waitForResponse(response =>
      response.url().endsWith('/admin/mq-dashboard/api/events'),
    )

    await navigateTo(page, '/admin/mq-dashboard', { waitUntil: 'load' })
    await expect(page).toHaveTitle(/glide-mq dashboard/i)

    const queues = await queuesResponse
    expect(queues.status()).toBe(200)
    expect(Array.isArray(await queues.json())).toBe(true)
    const events = await eventsResponse
    expect(events.status()).toBe(200)
    expect(events.headers()['content-type']).toContain('text/event-stream')
    expect(
      await page.evaluate(
        () => (window as unknown as { playwrightCspViolations: string[] }).playwrightCspViolations,
      ),
    ).toEqual([])
  })

  test('displays scheduled jobs table with expected columns', async ({ page }) => {
    const table = page.getByTestId('scheduled-jobs-table')
    await expect(table).toBeVisible({ timeout: 10_000 })
    const headers = table.locator('th')
    await expect(headers).toContainText(['Queue', 'Job', 'Schedule', 'Action'], {
      timeout: 10_000,
    })
  })

  test('displays trigger buttons for each job', async ({ page }) => {
    const table = page.getByTestId('scheduled-jobs-table')
    await expect(table).toBeVisible({ timeout: 10_000 })
    const triggerButtons = table.locator('tbody button')
    const count = await triggerButtons.count()
    expect(count).toBeGreaterThan(0)
  })

  test('clicking trigger button opens confirmation dialog', async ({ page }) => {
    const table = page.getByTestId('scheduled-jobs-table')
    const firstTriggerButton = table.locator('tbody button').first()
    await expect(firstTriggerButton).toBeVisible({ timeout: 10_000 })
    await firstTriggerButton.click()

    const confirmationDialog = page.getByRole('alertdialog')
    await expect(confirmationDialog).toBeVisible({ timeout: 5000 })
    const buttons = confirmationDialog.locator('button')
    await expect(buttons).toHaveCount(2, { timeout: 5000 })
  })

  test('confirmation dialog can be cancelled', async ({ page }) => {
    const table = page.getByTestId('scheduled-jobs-table')
    const firstTriggerButton = table.locator('tbody button').first()
    await expect(firstTriggerButton).toBeVisible({ timeout: 10_000 })
    await firstTriggerButton.click()

    const confirmationDialog = page.getByRole('alertdialog')
    await expect(confirmationDialog).toBeVisible({ timeout: 5000 })
    const buttons = confirmationDialog.locator('button')
    // First button is Cancel, second is Trigger
    await buttons.first().click()

    await expect(page.getByRole('alertdialog')).not.toBeVisible({ timeout: 5000 })
  })

  test('displays backfills table with expected columns', async ({ page }) => {
    const table = page.getByTestId('backfills-table')
    await expect(table).toBeVisible({ timeout: 10_000 })
    const headers = table.locator('th')
    await expect(headers).toContainText(['Queue', 'Description', 'Source Table', 'Action'], {
      timeout: 10_000,
    })
  })

  test('displays AI Agents section with toggle button reflecting live queue state', async ({
    page,
  }) => {
    const section = page.getByTestId('ai-agents-section')
    await expect(section).toBeVisible({ timeout: 10_000 })
    const toggle = page.getByTestId('ai-agents-toggle')
    await expect(toggle).toBeVisible({ timeout: 10_000 })
    // Button becomes enabled once queue state is loaded (not null) and shows a live label
    await expect(toggle).toBeEnabled({ timeout: 10_000 })
    const label = await toggle.textContent()
    expect(['Enable AI Agents', 'Disable AI Agents']).toContain(label?.trim())
  })

  test('displays Kagi Smallweb section with toggle button reflecting live queue state', async ({
    page,
  }) => {
    const section = page.getByTestId('kagi-section')
    await expect(section).toBeVisible({ timeout: 10_000 })
    const toggle = page.getByTestId('kagi-toggle')
    await expect(toggle).toBeVisible({ timeout: 10_000 })
    // Button becomes enabled once queue state is loaded (not null) and shows a live label
    await expect(toggle).toBeEnabled({ timeout: 10_000 })
    const label = await toggle.textContent()
    expect(['Enable Kagi Smallweb', 'Disable Kagi Smallweb']).toContain(label?.trim())
  })
})

test.describe('Queue Dashboard — kill switch error states', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows retry button for AI Agents section when queue stats endpoint fails', async ({
    page,
  }) => {
    // Fault injection: abort with 'aborted' so net::ERR_ABORTED is emitted — the browser monitor
    // treats ERR_ABORTED as an expected cancellation and does not record it as an issue.
    await page.route('**/api/v1/mq/queues', route => route.abort('aborted'))
    await navigateTo(page, '/admin/queues')
    await expect(page.getByTestId('ai-agents-retry')).toBeVisible({ timeout: 10_000 })
  })

  test('shows retry button for Kagi section when queue stats endpoint fails', async ({ page }) => {
    await page.route('**/api/v1/mq/queues', route => route.abort('aborted'))
    await navigateTo(page, '/admin/queues')
    await expect(page.getByTestId('kagi-retry')).toBeVisible({ timeout: 10_000 })
  })
})
