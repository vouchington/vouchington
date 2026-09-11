import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Web Search Page', () => {
  test('renders the h1 heading on the web search landing page', async ({ page }) => {
    await navigateTo(page, '/web-search')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('shows empty state when no query is given', async ({ page }) => {
    await navigateTo(page, '/web-search')

    // No query → empty state prompt; no results list rendered
    await expect(page.getByRole('heading', { level: 1, name: 'Web Search' })).toBeVisible()
    await expect(page.getByTestId('web-search-result-item')).toHaveCount(0)
  })

  test('shows empty state for a very short query', async ({ page }) => {
    await navigateTo(page, '/web-search?query=ab')

    await expect(page.getByTestId('web-search-result-item')).toHaveCount(0)
  })

  test('result items include a link and snippet', async ({ page }) => {
    await navigateTo(page, '/web-search?query=pwwebsearchsnippet')

    const items = page.getByTestId('web-search-result-item')
    await expect(items).not.toHaveCount(0)

    // Each result item must have a link to the URL detail page.
    const firstItem = items.first()
    await expect(firstItem.getByTestId('web-search-result-link')).toBeVisible()

    const snippet = firstItem.getByTestId('web-search-result-snippet')
    await expect(snippet).toBeVisible()
  })
})
