import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  insertTestCommunity,
  insertTestCommunityMember,
} from '../../../backend/test-helpers/entities/communities.mts'
import { insertTestTopic } from '../../../backend/test-helpers/entities/topics.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'

/**
 * Community lists page tests.
 * Tests the Lists tab, subtab navigation, and empty state rendering.
 */

let COMMUNITY_SLUG = ''

const createCommunityFixture = () => {
  const suffix = randomSuffix()
  return {
    slug: `pw-lists-playwright-${suffix}`,
    name: `PW Lists Playwright ${suffix}`,
  }
}

const listMenuItem = (page: Page, listType: string) =>
  page.getByTestId(`community-nav-lists-${listType}`)

async function openListsMenu(page: Page) {
  await page.getByTestId('community-nav-lists').click()
}

test.describe('Community Lists Page', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeAll(async () => {
    const fixture = createCommunityFixture()
    COMMUNITY_SLUG = fixture.slug

    const community = await insertTestCommunity({
      createdById: TEST_USER_ID,
      name: fixture.name,
      slug: COMMUNITY_SLUG,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      role: 'owner',
      userId: TEST_USER_ID,
    })
  })

  test('Lists tab is visible on community page', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await expect(page.getByTestId('community-nav-lists')).toBeVisible()
  })

  test('Lists menu opens entity destinations', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await openListsMenu(page)
    await expect(listMenuItem(page, 'topics')).toBeVisible()
  })

  test('lists menu shows entity destinations', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/topics`)
    await openListsMenu(page)

    await expect(listMenuItem(page, 'topics')).toBeVisible()
    await expect(listMenuItem(page, 'sources')).toBeVisible()
    await expect(listMenuItem(page, 'posts')).toBeVisible()
    await expect(listMenuItem(page, 'domains')).toBeVisible()
    await expect(listMenuItem(page, 'urls')).toBeVisible()
  })

  test('Sources menu item navigates correctly', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/topics`)
    await openListsMenu(page)
    await listMenuItem(page, 'sources').click()
    await expect(page).toHaveURL(`/communities/${COMMUNITY_SLUG}/lists/feeds`)
  })

  test('Posts menu item navigates correctly', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/topics`)
    await openListsMenu(page)
    await listMenuItem(page, 'posts').click()
    await expect(page).toHaveURL(`/communities/${COMMUNITY_SLUG}/lists/posts`)
  })

  test('Domains menu item navigates correctly', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/topics`)
    await openListsMenu(page)
    await listMenuItem(page, 'domains').click()
    await expect(page).toHaveURL(`/communities/${COMMUNITY_SLUG}/lists/domains`)
  })

  test('URLs menu item navigates correctly', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/topics`)
    await openListsMenu(page)
    await listMenuItem(page, 'urls').click()
    await expect(page).toHaveURL(`/communities/${COMMUNITY_SLUG}/lists/urls`)
  })

  test('empty state is shown when no items exist', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/topics`)
    await expect(page.getByTestId('empty-state-title')).toHaveText('No items yet')
    await expect(page.getByTestId('empty-state-description')).toContainText('No items')
  })

  test('feeds subtab shows empty state', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/feeds`)
    await expect(page.getByTestId('empty-state-title')).toHaveText('No items yet')
  })

  test('posts subtab shows empty state', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/posts`)
    await expect(page.getByTestId('empty-state-title')).toHaveText('No items yet')
  })

  test('domains subtab shows empty state', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/domains`)
    await expect(page.getByTestId('empty-state-title')).toHaveText('No items yet')
  })

  test('urls subtab shows empty state', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/urls`)
    await expect(page.getByTestId('empty-state-title')).toHaveText('No items yet')
  })

  test('moderator sees autocomplete search input on lists page', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/topics`)
    // The form renders an autocomplete (Command input) for the community owner/moderator
    await expect(page.getByTestId('entity-autocomplete')).toBeVisible()
    await expect(page.getByTestId('community-list-autocomplete-input-topic')).toBeVisible()
  })

  test('autocomplete input changes per subtab', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/feeds`)
    await expect(page.getByTestId('community-list-autocomplete-input-rss_feed')).toBeVisible()

    await openListsMenu(page)
    await listMenuItem(page, 'posts').click()
    await expect(page).toHaveURL(`/communities/${COMMUNITY_SLUG}/lists/posts`)
    await expect(page.getByTestId('community-list-autocomplete-input-post')).toBeVisible()
  })

  test('moderator can add and remove a topic list item', async ({ page }) => {
    const suffix = randomSuffix()
    const topicName = `PW List Managed Topic ${suffix}`
    const topicSlug = `pw-list-managed-topic-${suffix}`
    await insertTestTopic({
      name: topicName,
      slug: topicSlug,
      createdById: TEST_USER_ID,
    })

    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/topics`)
    const input = page.getByTestId('community-list-autocomplete-input-topic')
    await input.pressSequentially(topicName)
    await page.getByTestId('community-list-autocomplete-item-topic').click()

    const removeButton = page.getByTestId('community-list-item-remove-button')
    await expect(removeButton).toBeVisible()
    await removeButton.click()
    await expect(removeButton).toHaveCount(0)
  })

  test('URL autocomplete does not fire API for 1-2 char queries', async ({ page }) => {
    const urlRequests: string[] = []
    await page.route('**/api/v1/urls**', async route => {
      urlRequests.push(route.request().url())
      await route.continue()
    })

    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/urls`)
    const input = page.getByTestId('community-list-autocomplete-input-url')
    await expect(input).toBeVisible()

    // Type 1 character — early-return fires synchronously, no debounce scheduled
    await input.pressSequentially('h')
    await expect(page.getByTestId('entity-autocomplete-empty')).toContainText('3 characters')
    expect(urlRequests).toHaveLength(0)

    // Type a 2nd character — still below minimum
    await input.pressSequentially('t')
    await expect(page.getByTestId('entity-autocomplete-empty')).toContainText('3 characters')
    expect(urlRequests).toHaveLength(0)
  })

  test('URL autocomplete fires API once query reaches 3 characters', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/lists/urls`)

    const input = page.getByTestId('community-list-autocomplete-input-url')
    await expect(input).toBeVisible()

    const responsePromise = page.waitForResponse(
      resp =>
        resp.url().includes('/api/v1/urls') &&
        new URL(resp.url()).searchParams.has('query') &&
        resp.status() === 200,
      { timeout: 5000 },
    )

    await input.pressSequentially('htt')
    const response = await responsePromise

    expect(new URL(response.url()).searchParams.get('query')).toBe('htt')
  })
})
