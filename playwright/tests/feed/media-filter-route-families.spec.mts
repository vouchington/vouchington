import { test, expect, type Page } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Media feed filter route families', () => {
  test('podcast filters expose relationship-specific empty states and selected controls', async ({
    page,
  }) => {
    await withCleanUser(page)
    await navigateTo(page, '/feed/podcasts/friends')
    await expectSelectedFilter(page, 'Friends')
    await expect(page.getByTestId('empty-state-title')).toHaveText('No shared podcast episodes yet')
    await expect(
      page.getByTestId('empty-state').getByRole('link', { name: 'Find Friends' }),
    ).toHaveAttribute('href', '/my/friend-recommendations')

    await navigateTo(page, '/feed/podcasts/sources')
    await expectSelectedFilter(page, 'Sources')
    await expect(page.getByTestId('empty-state-title')).toHaveText('No podcast episodes yet')
    await expect(
      page.getByTestId('empty-state').getByRole('link', { name: 'Browse Podcasts' }),
    ).toHaveAttribute('href', '/podcasts')

    await navigateTo(page, '/feed/podcasts/topics')
    await expectSelectedFilter(page, 'Topics')
    await expect(page.getByTestId('empty-state-title')).toHaveText('No podcast episodes yet')
    await expect(
      page.getByTestId('empty-state').getByRole('link', { name: 'Browse Topics' }),
    ).toHaveAttribute('href', '/topics')
  })

  test('video filters expose relationship-specific empty states and selected controls', async ({
    page,
  }) => {
    await withCleanUser(page)
    await navigateTo(page, '/feed/videos/friends')
    await expectSelectedFilter(page, 'Friends')
    await expect(page.getByTestId('empty-state-title')).toHaveText('No shared videos yet')
    await expect(
      page.getByTestId('empty-state').getByRole('link', { name: 'Find Friends' }),
    ).toHaveAttribute('href', '/my/friend-recommendations')

    await navigateTo(page, '/feed/videos/sources')
    await expectSelectedFilter(page, 'Sources')
    await expect(page.getByTestId('empty-state-title')).toHaveText('No videos yet')
    await expect(
      page.getByTestId('empty-state').getByRole('link', { name: 'Browse Channels' }),
    ).toHaveAttribute('href', '/channels')

    await navigateTo(page, '/feed/videos/topics')
    await expectSelectedFilter(page, 'Topics')
    await expect(page.getByTestId('empty-state-title')).toHaveText('No videos yet')
    await expect(
      page.getByTestId('empty-state').getByRole('link', { name: 'Browse Topics' }),
    ).toHaveAttribute('href', '/topics')
  })
})

async function expectSelectedFilter(page: Page, label: string): Promise<void> {
  const trigger = page.getByTestId('feed-sub-filter-trigger')
  await expect(trigger).toHaveText(label)
  await trigger.click()
  await expect(page.getByRole('menuitem', { name: label, exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('list-filters-search-input')).toBeVisible()
}
