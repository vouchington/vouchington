import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from 'vouchington-tooling/playwright'
import { ADMIN_AUTH_STATE } from '../../helpers/auth-state.mts'

// Each click loads that namespace's details and history. Walking the full
// registry in one test exceeds the 30s cap, so slices keep every panel
// covered and the per-slice count fails closed when the registry outgrows it.
const namespacePanelSliceCount = 8
const maxNamespacesPerSlice = 12

function namespacePanelSlice(
  labels: readonly string[],
  slice: number,
): { index: number; label: string }[] {
  const selected: { index: number; label: string }[] = []
  for (const [index, rawLabel] of labels.entries()) {
    if (index % namespacePanelSliceCount === slice) {
      selected.push({ index, label: rawLabel.trim() })
    }
  }
  return selected
}

test.describe('Dynamic Config', () => {
  test.use({ storageState: ADMIN_AUTH_STATE })

  test('non-authenticated user is redirected away from /admin/dynamic-config', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/admin/dynamic-config')
    await expect(page).toHaveURL(/\/$/)
  })

  test('admin can browse namespaces, feature flags, and history', async ({ page }) => {
    await navigateTo(page, '/admin/dynamic-config')

    await expect(page.getByTestId('dynamic-config-heading')).toBeVisible()
    await expect(page.getByTestId('dynamic-config-refresh')).toBeVisible()
    await expect(page.getByTestId('dynamic-config-namespace-list')).toBeVisible()
    await expect(page.getByTestId('dynamic-config-namespace-button').first()).toBeVisible()
    const featureFlagsButton = page
      .getByTestId('dynamic-config-namespace-button')
      .filter({ hasText: 'Feature Flags' })
    await expect(featureFlagsButton).toBeVisible()
    await featureFlagsButton.click()
    await expect(page.getByTestId('dynamic-config-namespace-title')).toHaveText('Feature Flags')
    await expect(page.getByTestId('dynamic-config-namespace-panel')).toBeVisible()
    await expect(page.getByTestId('dynamic-config-fields-table')).toBeVisible()
    await expect(page.getByTestId('dynamic-config-boolean-field').first()).toBeVisible()
    await expect(page.getByTestId('dynamic-config-history')).toBeVisible()
    await page.getByTestId('dynamic-config-history-entry').count()
    await expect(page.getByTestId('dynamic-config-feature-override').first()).toBeVisible()
    await expect(page.getByTestId('dynamic-config-clear-feature-overrides')).toBeVisible()
  })

  test('admin can open app-attestation namespace and see the string signing mode field', async ({
    page,
  }) => {
    await navigateTo(page, '/admin/dynamic-config')

    await page.getByTestId('dynamic-config-search').fill('attestation')
    await page.getByRole('button', { name: /App Attestation/ }).click()

    await expect(page.getByTestId('dynamic-config-namespace-title')).toContainText(
      'App Attestation',
    )
    await expect(page.getByTestId('dynamic-config-string-field').first()).toBeVisible()
    await expect(page.getByTestId('dynamic-config-string-save-field').first()).toBeVisible()
  })

  test('admin can filter to reCAPTCHA namespace', async ({ page }) => {
    await navigateTo(page, '/admin/dynamic-config')

    await page.getByTestId('dynamic-config-search').fill('captcha')
    await page.getByRole('button', { name: /reCAPTCHA/ }).click()

    await expect(page.getByTestId('dynamic-config-namespace-title')).toContainText('reCAPTCHA')
    await expect(page.getByTestId('dynamic-config-number-field').first()).toBeVisible()
    await expect(page.getByTestId('dynamic-config-save-field').first()).toBeVisible()
  })

  for (const slice of Array.from({ length: namespacePanelSliceCount }, (_, index) => index)) {
    test(`admin can open registered namespace panels in slice ${slice + 1} of ${namespacePanelSliceCount} without client errors`, async ({
      page,
    }) => {
      await navigateTo(page, '/admin/dynamic-config')

      const namespaceButtons = page.getByTestId('dynamic-config-namespace-button')
      await expect(namespaceButtons.first()).toBeVisible()

      // Snapshot every label up front so the click loop below never re-resolves a button's
      // label after clicking it — that gap let a background refresh race the click and read
      // back a stale label. See dynamic-config-state.ts for the underlying selection-race fix.
      const labels = await page
        .getByTestId('dynamic-config-namespace-button-label')
        .allTextContents()
      expect(labels.length).toBeGreaterThan(0)
      expect(Math.ceil(labels.length / namespacePanelSliceCount)).toBeLessThanOrEqual(
        maxNamespacesPerSlice,
      )

      const selected = namespacePanelSlice(labels, slice)
      expect(selected.length).toBeGreaterThan(0)

      for (const { index, label } of selected) {
        await namespaceButtons.nth(index).click()

        await expect(page.getByTestId('dynamic-config-namespace-title')).toHaveText(label)
        await expect(page.getByTestId('dynamic-config-fields-table')).toBeVisible()
        await expect(page.getByTestId('dynamic-config-history')).toBeVisible()
      }
    })
  }
})
