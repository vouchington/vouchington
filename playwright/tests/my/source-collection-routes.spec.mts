import { test, expect } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { readFileSync } from 'node:fs'
import { requireTestValue } from '../../helpers/assertions.mts'

test.describe('Personal source collections', () => {
  test('empty collections open the matching add-source dialog', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, '/my/channels')
    await expect(page.getByTestId('empty-state-title')).toHaveText('No channels followed')
    await page.getByTestId('add-source-button').click()
    await expect(page.getByTestId('add-source-dialog-title')).toHaveText('Add a channel')
    await expect(page.getByLabel('Channel URL')).toBeEditable()
    await page.keyboard.press('Escape')

    await navigateTo(page, '/my/podcasts')
    await expect(page.getByTestId('empty-state-title')).toHaveText('No podcasts followed')
    await page.getByTestId('add-source-button').click()
    await expect(page.getByTestId('add-source-dialog-title')).toHaveText('Add a podcast')
    await expect(page.getByLabel('Podcast RSS URL')).toBeEditable()
    await page.keyboard.press('Escape')

    await navigateTo(page, '/my/news-sources')
    await expect(page.getByTestId('empty-state-title')).toHaveText('No news sources followed')
    await page.getByTestId('add-source-button').click()
    await expect(page.getByTestId('add-source-dialog-title')).toHaveText('Add a news source')
    await expect(page.getByLabel('Feed URL')).toBeEditable()
    await page.keyboard.press('Escape')
  })

  test('country preference persists after navigating back to language settings', async ({
    page,
  }) => {
    const user = await withCleanUser(page)
    await navigateTo(page, '/my/language')
    const country = page.getByRole('combobox', { name: 'Country', exact: true })
    await country.click()
    const persisted = page.waitForResponse(
      response =>
        response.url().includes(`/api/v1/users/${user.id}`) &&
        response.request().method() === 'PATCH' &&
        response.ok(),
    )
    await page.getByRole('option', { name: 'Canada', exact: true }).click()
    await persisted
    await navigateTo(page, '/my/language')
    await expect(country).toHaveText('Canada')
  })

  test('all-source export applies the type selected in the hydrated form', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, '/my/sources/import-export')
    const type = page.getByTestId('import-export-type-select')
    await type.click()
    await page.getByRole('option', { name: 'Podcasts', exact: true }).click()
    await expect(type).toContainText('Podcasts')
    const exported = page.waitForEvent('download')
    await page.getByTestId('export-opml-button').click()
    const download = await exported
    const path = requireTestValue(await download.path(), 'Export download path missing')
    expect(readFileSync(path, 'utf8')).toContain('<opml')
  })
})
