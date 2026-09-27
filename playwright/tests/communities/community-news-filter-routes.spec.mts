import { expect, test } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { insertTestCommunity } from '../../../backend/test-helpers/entities/communities.mts'

test('community news filters retain the genuine community and expose matching selection', async ({
  page,
}) => {
  const user = await withCleanUser(page)
  const community = await insertTestCommunity({ createdById: user.id })
  await navigateTo(page, `/communities/${community.slug}/news/sources`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(community.name)
  await expect(page.getByTestId('empty-state-title')).toHaveText('No news yet')
  const filter = page.getByRole('button', { name: 'Select community news filter' })
  await expect(filter).toContainText('Sources')
  await filter.click()
  await expect(page.getByRole('menuitem', { name: 'Sources', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.keyboard.press('Escape')

  await navigateTo(page, `/communities/${community.slug}/news/topics`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(community.name)
  await expect(page.getByTestId('empty-state-title')).toHaveText('No news yet')
  await expect(filter).toContainText('Topics')
  await filter.click()
  await expect(page.getByRole('menuitem', { name: 'Topics', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
})
