import { test, expect } from '../../helpers/test.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { setTopicBestSortInputs } from '../../../backend/test-helpers/entities/topic-metrics.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test.describe('Topic sort filters', () => {
  test('shows New and Best sort options by default', async ({ page }) => {
    await navigateTo(page, '/cards')
    await waitForBelowFoldHydration(page)

    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-new')).toBeVisible()
    await expect(page.getByTestId('list-filters-sort-option-best')).toBeVisible()
  })

  test('does not show Trending sort option', async ({ page }) => {
    await navigateTo(page, '/cards')
    await waitForBelowFoldHydration(page)

    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-trending')).toBeHidden()
  })

  test('does not show Relevance sort option without a search query', async ({ page }) => {
    await navigateTo(page, '/cards')
    await waitForBelowFoldHydration(page)

    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-relevance')).toBeHidden()
  })

  test('shows Relevance sort option when a search query is active', async ({ page }) => {
    await navigateTo(page, '/cards?q=chase')
    await waitForBelowFoldHydration(page)

    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-relevance')).toBeVisible()
  })

  test('sets sort=relevance in URL when search is submitted', async ({ page }) => {
    await navigateTo(page, '/cards')
    await waitForBelowFoldHydration(page)

    const searchInput = page.getByTestId('list-filters-search-input')
    await searchInput.pressSequentially('chase')
    await searchInput.press('Enter')

    await expect(page).toHaveURL(/sort=relevance/)
    await expect(page).toHaveURL(/q=chase/)
    await expect(searchInput).toBeFocused()
  })

  test('Relevance sort option disappears after clearing search', async ({ page }) => {
    await navigateTo(page, '/cards?q=chase&sort=relevance')
    await waitForBelowFoldHydration(page)

    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-relevance')).toBeVisible()
    await page.keyboard.press('Escape')

    const searchInput = page.getByTestId('list-filters-search-input')
    await searchInput.clear()
    await searchInput.press('Enter')

    await expect(page).not.toHaveURL(/sort=relevance/)
    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-relevance')).toBeHidden()
  })

  test('sort=best orders topics by weighted rating score instead of alphabetically', async ({
    page,
  }) => {
    const unique = randomSuffix()
    const topicA = await insertTestTopic(
      `Playwright Best ${unique} Alpha`,
      `playwright-best-alpha-${unique}`,
    )
    const topicB = await insertTestTopic(
      `Playwright Best ${unique} Beta`,
      `playwright-best-beta-${unique}`,
    )
    const topicC = await insertTestTopic(
      `Playwright Best ${unique} Gamma`,
      `playwright-best-gamma-${unique}`,
    )

    await setTopicBestSortInputs(topicA.id, 9)
    await setTopicBestSortInputs(topicB.id, 4)
    await setTopicBestSortInputs(topicC.id, 1)

    await navigateTo(page, `/topics?q=Playwright Best ${unique}&sort=best`)

    const headings = await page
      .getByRole('heading', { level: 3 })
      .filter({ hasText: `Playwright Best ${unique}` })
      .allTextContents()

    expect(headings.slice(0, 3)).toEqual([
      `Playwright Best ${unique} Alpha`,
      `Playwright Best ${unique} Beta`,
      `Playwright Best ${unique} Gamma`,
    ])
  })
})
