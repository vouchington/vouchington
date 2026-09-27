import { expect, test } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { createTestPost } from '../../../backend/test-helpers/entities/create-test-entities.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test('profile collections show the real user activity and isolated empty collections', async ({
  page,
}) => {
  const user = await withCleanUser(page)
  const title = `Profile owned discussion ${randomSuffix()}`
  await createTestPost({ user, title, post_type: 'discussion' })
  await navigateTo(page, `/user/${user.username}/posts`)
  await expect(page.locator('main').getByRole('link', { name: title, exact: true })).toBeVisible()
  await page.locator('main').getByRole('link', { name: title, exact: true }).click()
  await expect(page.getByTestId('post-detail-heading')).toHaveText(title)

  await navigateTo(page, `/user/${user.username}/communities/member`)
  await expect(page.getByTestId('empty-state-title')).toHaveText('No member communities')

  await navigateTo(page, `/user/${user.username}/rss-feeds/viewed`)
  await expect(page.getByTestId('empty-state-title')).toHaveText('No recently viewed feeds')
})
