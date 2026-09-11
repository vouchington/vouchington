import {
  createTestUser,
  insertTestCommunity,
  insertTestCuratedAsideItem,
} from '../../../backend/test-helpers/index.mts'
import { test, expect, type Page } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

async function seedCuratedAsideFixtures() {
  const suffix = randomSuffix()
  const topicPositionBase = -30_000 + (Number.parseInt(suffix.slice(0, 6), 16) % 1000) * 2

  const admin = await createTestUser({
    username: `pw-curated-asides-admin-${suffix}`,
    administrator: true,
  })

  const topic = await insertTestTopic(`PW Curated Topic ${suffix}`, `pw-curated-topic-${suffix}`)
  const secondTopic = await insertTestTopic(
    `PW Curated Topic Second ${suffix}`,
    `pw-curated-topic-second-${suffix}`,
  )
  await insertTestTopic(`PW Curated Topic Add ${suffix}`, `pw-curated-topic-add-${suffix}`)
  const sourceTopic = await insertTestTopic(
    `PW Curated Source Topic ${suffix}`,
    `pw-curated-source-topic-${suffix}`,
  )
  const source = await insertTestRssFeed(sourceTopic.id, `pw-curated-source-${suffix}`)
  const community = await insertTestCommunity({
    createdById: admin.id,
    name: `PW Curated Community ${suffix}`,
    slug: `pw-curated-community-${suffix}`,
  })

  await insertTestCuratedAsideItem({
    asideType: 'topic',
    entityId: topic.id,
    position: topicPositionBase,
    createdById: admin.id,
  })
  await insertTestCuratedAsideItem({
    asideType: 'topic',
    entityId: secondTopic.id,
    position: topicPositionBase + 1,
    createdById: admin.id,
  })
  await insertTestCuratedAsideItem({
    asideType: 'source',
    entityId: source.id,
    position: 0,
    createdById: admin.id,
  })
  await insertTestCuratedAsideItem({
    asideType: 'community',
    entityId: community.id,
    position: 0,
    createdById: admin.id,
  })

  return {
    addTopicName: `PW Curated Topic Add ${suffix}`,
    communityName: `PW Curated Community ${suffix}`,
    secondTopicName: `PW Curated Topic Second ${suffix}`,
    sourceName: `Test Feed pw-curated-source-${suffix}`,
    topicName: `PW Curated Topic ${suffix}`,
  }
}

test.describe('Curated Asides admin page', () => {
  test.use({ storageState: AUTH_STATE })

  test('unauthenticated user is redirected away from /curated-asides/topics', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/curated-asides/topics')
    await expect(page).toHaveURL(/\/$/)
  })

  test.describe('as admin', () => {
    let fixtures: Awaited<ReturnType<typeof seedCuratedAsideFixtures>>

    test.beforeEach(async ({ page }) => {
      fixtures = await seedCuratedAsideFixtures()
      await navigateTo(page, '/curated-asides/topics')
      await expect(page.getByTestId('curated-asides-page')).toBeVisible()
    })

    test('shows URL-backed tab navigation and inline autocomplete form', async ({ page }) => {
      await expect(page).toHaveURL(/\/curated-asides\/topics$/)
      await expect(page.getByRole('tab', { name: 'Topics' })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Sources' })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Communities' })).toBeVisible()
      await expect(page.getByTestId('curated-aside-add-form')).toBeVisible()
      await expect(page.getByTestId('curated-aside-entity-autocomplete')).toBeVisible()
      await expect(page.getByTestId('curated-aside-add-submit')).toBeDisabled()
      await expect(page.getByTestId('add-curated-item-dialog-trigger')).toHaveCount(0)
    })

    test('renders entity labels without position or UUID columns', async ({ page }) => {
      const row = page.getByTestId('curated-item-row').filter({ hasText: fixtures.topicName })
      await expect(page.getByTestId('curated-items-table')).toBeVisible()
      await expect(row).toBeVisible()
      await expect(row.getByTestId('curated-item-label')).toHaveText(fixtures.topicName)
      await expect(row.getByTestId('curated-item-drag-handle')).toBeVisible()
      await expect(row.getByTestId('curated-item-delete')).toBeVisible()
      await expect(page.getByText('Position')).toHaveCount(0)
      await expect(page.getByText('Entity UUID')).toHaveCount(0)
    })

    test('loads and renders tabs from URL state', async ({ page }) => {
      await page.getByRole('tab', { name: 'Sources' }).click()
      await expect(page).toHaveURL(/\/curated-asides\/sources$/)
      await expect(
        page.getByTestId('curated-item-row').filter({ hasText: fixtures.sourceName }),
      ).toBeVisible()

      await page.getByRole('tab', { name: 'Communities' }).click()
      await expect(page).toHaveURL(/\/curated-asides\/communities$/)
      await expect(
        page.getByTestId('curated-item-row').filter({ hasText: fixtures.communityName }),
      ).toBeVisible()
    })

    test('adds a curated topic from the inline autocomplete', async ({ page }) => {
      const topicSearch = page.waitForResponse(response => {
        return response.url().includes('/api/v1/topics') && response.status() === 200
      })
      await page.getByTestId('curated-aside-entity-autocomplete').fill(fixtures.addTopicName)
      await topicSearch

      const option = page
        .getByTestId('curated-aside-entity-option')
        .filter({ hasText: fixtures.addTopicName })
      await expect(option).toBeVisible()
      await option.click()

      await expect(
        page.getByTestId('curated-item-row').filter({ hasText: fixtures.addTopicName }),
      ).toBeVisible()
    })

    test('reorders curated items with up and down buttons', async ({ page }) => {
      const secondRow = page
        .getByTestId('curated-item-row')
        .filter({ hasText: fixtures.secondTopicName })
      await secondRow.getByTestId('curated-item-move-up').click()

      await expect
        .poll(() => getFixtureOrder(page, fixtures), {
          message: 'second fixture row should move before the first fixture row',
        })
        .toEqual(['second', 'first'])

      await secondRow.getByTestId('curated-item-move-down').click()
      await expect
        .poll(() => getFixtureOrder(page, fixtures), {
          message: 'second fixture row should move after the first fixture row',
        })
        .toEqual(['first', 'second'])
    })
  })
})

async function getFixtureOrder(
  page: Page,
  fixtures: Awaited<ReturnType<typeof seedCuratedAsideFixtures>>,
): Promise<Array<'first' | 'second'>> {
  const rowTexts = await page.getByTestId('curated-item-row').allTextContents()
  return rowTexts
    .map(text => {
      if (text.includes(fixtures.topicName)) return 'first' as const
      if (text.includes(fixtures.secondTopicName)) return 'second' as const
      return null
    })
    .filter((value): value is 'first' | 'second' => value !== null)
}
