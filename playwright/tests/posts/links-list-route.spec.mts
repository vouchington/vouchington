import { expect, test } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { createTestPost } from '../../../backend/test-helpers/entities/create-test-entities.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test('link collection searches a genuine link and opens its detail', async ({ page }) => {
  const user = await withCleanUser(page)
  const suffix = randomSuffix()
  const title = `Owned link ${suffix}`
  await createTestPost({
    user,
    title,
    post_type: 'link',
    url: `https://example.com/list-${suffix}`,
  })
  await navigateTo(page, '/links')
  const search = page.getByTestId('list-filters-search-input')
  await search.pressSequentially(title)
  await search.press('Enter')
  await expect(page).toHaveURL(url => url.searchParams.get('q') === title)
  const link = page.locator('main').getByRole('link', { name: title, exact: true })
  await expect(link).toBeVisible()
  await link.click()
  await expect(page.getByTestId('post-detail-heading')).toContainText(title)
})
