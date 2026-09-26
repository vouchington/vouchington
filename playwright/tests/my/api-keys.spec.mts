import { randomUUID } from 'node:crypto'
import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

test.describe('My API Keys Page', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/my/api-keys')
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/my/api-keys')
    await expect(page).toHaveURL('/login')
  })

  test('displays API Keys heading', async ({ page }) => {
    await expect(page.getByTestId('settings-page-header-title')).toContainText('API Keys')
  })

  test('displays example RSS URL', async ({ page }) => {
    await expect(page.getByTestId('api-keys-example-rss')).toBeVisible()
    await expect(page.getByTestId('api-keys-example-rss')).toContainText('/rss/posts')
  })

  test('displays Create API Key button', async ({ page }) => {
    await expect(page.getByTestId('api-keys-create-button')).toBeVisible()
  })

  test('shows create form when Create API Key is clicked', async ({ page }) => {
    await page.getByTestId('api-keys-create-button').click()
    await expect(page.getByTestId('api-keys-create-confirm-button')).toBeVisible()
    await expect(page.getByTestId('api-keys-create-cancel-button')).toBeVisible()
    await expect(page.getByTestId('api-keys-create-label-input')).toBeVisible()
  })

  test('Create button is disabled when label is empty', async ({ page }) => {
    await page.getByTestId('api-keys-create-button').click()
    await expect(page.getByTestId('api-keys-create-confirm-button')).toBeDisabled()
  })

  test('Create button is enabled when label is filled', async ({ page }) => {
    await page.getByTestId('api-keys-create-button').click()
    await page.getByTestId('api-keys-create-label-input').pressSequentially('My test key')
    await expect(page.getByTestId('api-keys-create-confirm-button')).toBeEnabled()
  })

  test('Cancel hides the create form', async ({ page }) => {
    await page.getByTestId('api-keys-create-button').click()
    await expect(page.getByTestId('api-keys-create-label-input')).toBeVisible()

    await page.getByTestId('api-keys-create-cancel-button').click()
    await expect(page.getByTestId('api-keys-create-button')).toBeVisible()
    await expect(page.getByTestId('api-keys-create-label-input')).toBeHidden()
  })

  test('created API key is shown once and can be revoked', async ({ page }) => {
    const label = `Playwright RSS ${randomUUID()}`

    await page.getByTestId('api-keys-create-button').click()
    const labelInput = page.getByTestId('api-keys-create-label-input')
    const confirmButton = page.getByTestId('api-keys-create-confirm-button')
    await labelInput.fill(label)
    await expect(labelInput).toHaveValue(label)
    await expect(confirmButton).toBeEnabled()
    const createResponsePromise = page.waitForResponse(response => {
      return (
        response.url().includes('/api/v1/my/api-keys') && response.request().method() === 'POST'
      )
    })
    await confirmButton.click()
    const createResponse = await createResponsePromise
    expect(createResponse.status(), await createResponse.text()).toBe(201)

    await expect(page.getByTestId('api-keys-created-alert')).toBeVisible()
    const rawKey = await page.getByTestId('api-keys-created-raw-key-input').inputValue()
    expect(rawKey).toMatch(/^voucha_rss_/)
    await expect(page.getByTestId('api-keys-copy-raw-key-button')).toBeVisible()
    await expect(page.getByTestId('api-key-active-row').filter({ hasText: label })).toBeVisible()

    await page.getByTestId('api-keys-dismiss-raw-key-button').click()
    await expect(page.getByTestId('api-keys-created-alert')).toBeHidden()
    await page.reload()
    // page.reload() only waits for the 'load' event; React hasn't necessarily
    // hydrated yet, so the click below can fire before React attaches its
    // onClick handler, silently dropping it. See navigateTo(), which does the
    // same wait after every navigation.
    await waitForBelowFoldHydration(page)
    await expect(page.getByTestId('api-key-active-row').filter({ hasText: label })).toBeVisible()
    await expect(page.getByTestId('api-keys-created-alert')).toBeHidden()

    const keyRow = page.getByTestId('api-key-active-row').filter({ hasText: label })
    await keyRow.getByTestId('api-key-revoke-start').click()
    await keyRow.getByTestId('api-key-revoke-confirm').click()
    await expect(page.getByTestId('api-key-revoked-row').filter({ hasText: label })).toBeVisible()
  })

  test('creates an MCP key with scopes picked from the catalogue', async ({ page }) => {
    const label = `Playwright MCP ${randomUUID()}`

    await page.getByTestId('api-keys-create-button').click()
    await page.getByTestId('api-keys-create-type-mcp').click()
    const picker = page.getByTestId('api-key-scope-picker')
    await expect(picker).toBeVisible()

    await page.getByTestId('api-keys-create-audience-admin').click()
    await expect(picker.getByTestId('scope-checkbox-mcp.admin:read')).toBeVisible()
    await page.getByTestId('api-keys-create-audience-user').click()
    await expect(picker.getByTestId('scope-checkbox-mcp.admin:read')).toHaveCount(0)

    await picker.getByTestId('scope-checkbox-cards:write').click()
    await expect(picker.getByTestId('scope-checkbox-cards:read')).toBeChecked()
    await page.getByTestId('api-keys-create-label-input').pressSequentially(label)
    const createResponsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/v1/my/api-keys') && response.request().method() === 'POST',
    )
    await page.getByTestId('api-keys-create-confirm-button').click()
    const createResponse = await createResponsePromise
    expect(createResponse.status(), await createResponse.text()).toBe(201)

    const rawKey = await page.getByTestId('api-keys-created-raw-key-input').inputValue()
    expect(rawKey).toMatch(/^voucha_mcp_/)
    await page.getByTestId('api-keys-dismiss-raw-key-button').click()
    const keyRow = page.getByTestId('api-key-active-row').filter({ hasText: label })
    await expect(keyRow).toContainText('cards:read')
    await expect(keyRow).toContainText('cards:write')

    await keyRow.getByTestId('api-key-revoke-start').click()
    await keyRow.getByTestId('api-key-revoke-confirm').click()
    await expect(page.getByTestId('api-key-revoked-row').filter({ hasText: label })).toBeVisible()
  })
})
