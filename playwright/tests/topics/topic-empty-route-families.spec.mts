import { test, expect, type Page } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestEmptyReferralProgram } from '../../helpers/insert-test-referral-program.mts'

test.describe('Typed topic list route families', () => {
  test('bank_account keeps its empty list, topic identity and selected navigation', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const name = `Route bank_account ${suffix}`
    const { id } = await insertTestTopic(name, `route-bank-account-${suffix}`, 'bank_account')
    await navigateTo(page, `/bank-account/${id}`)
    await expectEmptyTopicTab(page, name, 'posts')
    await navigateTo(page, `/bank-account/${id}/posts`)
    await expectEmptyTopicTab(page, name, 'posts')
    await navigateTo(page, `/bank-account/${id}/discussions`)
    await expectEmptyTopicTab(page, name, 'posts')
    await navigateTo(page, `/bank-account/${id}/reviews`)
    await expectEmptyTopicTab(page, name, 'reviews')
    await navigateTo(page, `/bank-account/${id}/data-points`)
    await expectEmptyTopicTab(page, name, 'data-points')
    await navigateTo(page, `/bank-account/${id}/latest`)
    await expectEmptyTopicTab(page, name, 'latest')
    await navigateTo(page, `/bank-account/${id}/news`)
    await expectEmptyTopicTab(page, name, 'news')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })

  test('rewards_program keeps its empty list, topic identity and selected navigation', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const name = `Route rewards_program ${suffix}`
    const { id } = await insertTestTopic(name, `route-rewards-program-${suffix}`, 'rewards_program')
    await navigateTo(page, `/rewards-program/${id}`)
    await expectEmptyTopicTab(page, name, 'posts')
    await navigateTo(page, `/rewards-program/${id}/discussions`)
    await expectEmptyTopicTab(page, name, 'posts')
    await navigateTo(page, `/rewards-program/${id}/latest`)
    await expectEmptyTopicTab(page, name, 'latest')
    await navigateTo(page, `/rewards-program/${id}/news`)
    await expectEmptyTopicTab(page, name, 'news')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })

  test('rewards_program_status keeps its empty list, topic identity and selected navigation', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const name = `Route rewards_program_status ${suffix}`
    const { id } = await insertTestTopic(
      name,
      `route-rewards-program-status-${suffix}`,
      'rewards_program_status',
    )
    await navigateTo(page, `/rewards-program-status/${id}`)
    await expectEmptyTopicTab(page, name, 'posts')
    await navigateTo(page, `/rewards-program-status/${id}/discussions`)
    await expectEmptyTopicTab(page, name, 'posts')
    await navigateTo(page, `/rewards-program-status/${id}/reviews`)
    await expectEmptyTopicTab(page, name, 'reviews')
    await navigateTo(page, `/rewards-program-status/${id}/data-points`)
    await expectEmptyTopicTab(page, name, 'data-points')
    await navigateTo(page, `/rewards-program-status/${id}/latest`)
    await expectEmptyTopicTab(page, name, 'latest')
    await navigateTo(page, `/rewards-program-status/${id}/news`)
    await expectEmptyTopicTab(page, name, 'news')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })

  test('referral_program keeps its empty list, topic identity and selected navigation', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const name = `Playwright Referral Program Empty ${suffix}`
    const { topicId: id } = await insertTestEmptyReferralProgram(suffix)
    await navigateTo(page, `/referral-program/${id}/reviews`)
    await expectEmptyTopicTab(page, name, 'reviews')
    await navigateTo(page, `/referral-program/${id}/data-points`)
    await expectEmptyTopicTab(page, name, 'data-points')
    await navigateTo(page, `/referral-program/${id}/latest`)
    await expectEmptyTopicTab(page, name, 'latest', 'referral-links')
    await navigateTo(page, `/referral-program/${id}/news`)
    await expectEmptyTopicTab(page, name, 'news')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })

  test('topic keeps its empty list, topic identity and selected navigation', async ({ page }) => {
    const suffix = randomSuffix()
    const name = `Route topic ${suffix}`
    const { id } = await insertTestTopic(name, `route-topic-${suffix}`, 'topic')
    await navigateTo(page, `/topic/${id}/data-points`)
    await expectEmptyTopicTab(page, name, 'data-points')
    await navigateTo(page, `/topic/${id}/latest`)
    await expectEmptyTopicTab(page, name, 'latest')
    await navigateTo(page, `/topic/${id}/news`)
    await expectEmptyTopicTab(page, name, 'news')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })

  test('rss_feed keeps its empty list, topic identity and selected navigation', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const name = `Route rss_feed ${suffix}`
    const { id } = await insertTestTopic(name, `route-rss-feed-${suffix}`, 'rss_feed')
    await navigateTo(page, `/source/${id}/discussions`)
    await expectEmptyTopicTab(page, name, 'posts')
    await navigateTo(page, `/source/${id}/reviews`)
    await expectEmptyTopicTab(page, name, 'reviews')
    await navigateTo(page, `/source/${id}/data-points`)
    await expectEmptyTopicTab(page, name, 'data-points')
    await navigateTo(page, `/source/${id}/news`)
    await expectEmptyTopicTab(page, name, 'news')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  })
})

async function expectEmptyTopicTab(
  page: Page,
  name: string,
  tab: 'posts' | 'reviews' | 'data-points' | 'latest' | 'news',
  rootTab = 'posts',
): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  const activeTab =
    tab === 'posts'
      ? page.getByTestId('topic-detail-tab-posts')
      : tab === 'reviews'
        ? page.getByTestId('topic-detail-tab-reviews')
        : tab === 'data-points'
          ? page.getByTestId('topic-detail-tab-data-points')
          : tab === 'latest'
            ? page.getByTestId('topic-detail-tab-latest')
            : page.getByTestId('topic-detail-tab-news')
  await expect(activeTab).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('empty-state-title')).toHaveText(
    tab === 'latest' || tab === 'news' ? 'No news found' : 'No posts found',
  )
  if (tab === 'posts') await expect(page).toHaveURL(/\/posts$/)
  if (tab !== 'latest') {
    const search = page.getByTestId('list-filters-search-input')
    await search.pressSequentially('route-owned-empty-query')
    await search.press('Enter')
    await expect
      .poll(() => new URL(page.url()).searchParams.get('q'))
      .toBe('route-owned-empty-query')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
  } else {
    await page.getByRole('heading', { level: 1 }).getByRole('link', { name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${rootTab}$`))
    await expect(page.getByTestId(`topic-detail-tab-${rootTab}`)).toHaveAttribute(
      'aria-current',
      'page',
    )
  }
}
