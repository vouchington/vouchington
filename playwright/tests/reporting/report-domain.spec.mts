import { expect, test } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { insertTestUrlHostname } from '../../../backend/test-helpers/index.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

let hostnameId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  hostnameId = await insertTestUrlHostname({
    hostname: `report-domain-test-${suffix}.example.com`,
  })
})

test.describe('Report domain', () => {
  test('signed-in user can report a domain hostname', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, `/domain/${hostnameId}`)

    await expect(page.getByTestId('domain-detail-heading')).toBeVisible({ timeout: 10_000 })

    const reportButton = page.getByTestId('report-inline-button').first()
    await expect(reportButton).toBeVisible()
    await reportButton.click()

    const dialog = page.getByTestId('report-dialog')
    await expect(dialog).toBeVisible()

    const spamRadio = page.getByTestId('report-reason-spam')
    await expect(spamRadio).toBeVisible()
    await spamRadio.click()

    const submitButton = page.getByTestId('report-submit')
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    await expect(dialog.getByTestId('report-success-message')).toBeVisible()
  })
})
