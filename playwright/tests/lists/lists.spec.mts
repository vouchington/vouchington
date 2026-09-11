import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { MOBILE_VIEWPORTS } from '../../helpers/viewport-constants.mts'
import {
  insertTestTopic,
  insertTestRssFeed,
  createTestRssFeedItemWithUrl,
  insertTestList,
  insertTestListRssFeedItem,
  createTestUser,
} from '../../../backend/test-helpers/index.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'

/**
 * Lists feature Playwright specs.
 * Covers: /my/lists page, /list/[id] page, sidebar, and add-to-list modal menu item.
 */

// --- /my/lists page: authenticated user sees the page and sidebar ---
test.describe('My Lists page — page and sidebar visibility', () => {
  test.use({ storageState: AUTH_STATE })

  test('my-lists-page, sidebar-group-lists, and sidebar-nav-my-lists are visible', async ({
    page,
  }) => {
    await navigateTo(page, '/my/lists')
    await expect(page.getByTestId('my-lists-page')).toBeVisible()
    await expect(page.getByTestId('sidebar-group-lists')).toBeVisible()
    // sidebar-nav-my-lists renders in both the static nav intent and the dynamic
    // ListsSidebarGroup header — use .first() to avoid strict-mode violation.
    await expect(page.getByTestId('sidebar-nav-my-lists').first()).toBeVisible()
  })
})

// --- /my/lists page: my-list-item renders when a list exists ---
test.describe('My Lists page — list item link', () => {
  test('my-list-item is visible after creating a list', async ({ page }) => {
    const user = await withCleanUser(page)
    const listName = `PW My List ${randomSuffix()}`

    await insertTestList({ ownerUserId: user.id, name: listName })

    await navigateTo(page, '/my/lists')
    await expect(page.getByTestId('my-list-item').first()).toBeVisible()
    await expect(page.getByTestId('my-list-item').first()).toContainText(listName)
  })
})

// --- /list/[id] page: list-name and list-item ---
test.describe('List detail page', () => {
  test('list-name is visible on the list page', async ({ page }) => {
    const user = await withCleanUser(page)
    const listName = `PW List Name ${randomSuffix()}`

    const list = await insertTestList({ ownerUserId: user.id, name: listName })

    await navigateTo(page, `/list/${list.id}`)
    await expect(page.getByTestId('list-name')).toBeVisible()
    await expect(page.getByTestId('list-name')).toContainText(listName)
  })

  test('list-item is visible when an RSS feed item is added to the list', async ({ page }) => {
    const user = await withCleanUser(page)
    const suffix = randomSuffix()

    // Create topic → feed → feed item via backend helpers
    const topicId = await insertTestTopic({
      name: `PW List Topic ${suffix}`,
      slug: `pw-list-topic-${suffix}`,
      createdById: TEST_USER_ID,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `PW List Feed ${suffix}`,
    })
    const { id: rssFeedItemId } = await createTestRssFeedItemWithUrl(feedId)

    // Create list and add the RSS feed item via backend helpers (auth is the clean user)
    const list = await insertTestList({
      ownerUserId: user.id,
      name: `PW List Item ${suffix}`,
    })
    await insertTestListRssFeedItem({ listId: list.id, rssFeedItemId })

    await navigateTo(page, `/list/${list.id}`)
    await expect(page.getByTestId('list-item').first()).toBeVisible()
  })
})

// --- add-to-list-menu-item: mobile modal footer kebab ---
// AddToListMenuItem renders only in the mobile FollowerShareActions kebab
// (className='sm:hidden') inside the RSS item modal footer. A viewport < 640px
// is required to make that section visible.
test.describe('Add to List menu item — mobile modal', () => {
  test.use({
    storageState: AUTH_STATE,
    viewport: MOBILE_VIEWPORTS['iphone-se'],
  })

  test('add-to-list-menu-item is visible in the news item modal kebab on mobile', async ({
    page,
  }) => {
    await navigateTo(page, '/news')
    await page.getByTestId('news-item-show-more-link').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByTestId('rss-feed-item-modal-more-actions-button').click()
    await expect(page.getByTestId('add-to-list-menu-item')).toBeVisible()
  })
})

// --- list-tabs, list-tab-all, list-empty ---
test.describe('List detail page — tabs and empty state', () => {
  test('list-tabs, list-tab-all, and list-empty are visible on an empty list', async ({ page }) => {
    const user = await withCleanUser(page)
    const suffix = randomSuffix()
    const list = await insertTestList({ ownerUserId: user.id, name: `PW Tabs ${suffix}` })
    await navigateTo(page, `/list/${list.id}`)
    await expect(page.getByTestId('list-tabs')).toBeVisible()
    await expect(page.getByTestId('list-tab-all')).toBeVisible()
    await expect(page.getByTestId('list-empty')).toBeVisible()
  })
})

// --- list-page-actions, list-copy-link, list-import-community ---
// --- import-community-dialog, import-community-id-input, import-community-submit ---
// ListPageActions renders only for the list owner.
test.describe('List detail page — owner actions and import dialog', () => {
  test('list-page-actions, list-copy-link, list-import-community are visible to owner', async ({
    page,
  }) => {
    const user = await withCleanUser(page)
    const suffix = randomSuffix()
    const list = await insertTestList({ ownerUserId: user.id, name: `PW Actions ${suffix}` })
    await navigateTo(page, `/list/${list.id}`)
    await expect(page.getByTestId('list-page-actions')).toBeVisible()
    await expect(page.getByTestId('list-copy-link')).toBeVisible()
    await expect(page.getByTestId('list-import-community')).toBeVisible()
  })

  test('import-community-dialog, import-community-id-input, and import-community-submit open on click', async ({
    page,
  }) => {
    const user = await withCleanUser(page)
    const suffix = randomSuffix()
    const list = await insertTestList({ ownerUserId: user.id, name: `PW Import ${suffix}` })
    await navigateTo(page, `/list/${list.id}`)
    await page.getByTestId('list-import-community').click()
    await expect(page.getByTestId('import-community-dialog')).toBeVisible()
    await expect(page.getByTestId('import-community-id-input')).toBeVisible()
    await expect(page.getByTestId('import-community-submit')).toBeVisible()
  })
})

// --- list-items, list-item-row ---
test.describe('List detail page — items', () => {
  test('list-items and list-item-row are visible when a list has items', async ({ page }) => {
    const user = await withCleanUser(page)
    const suffix = randomSuffix()
    const topicId = await insertTestTopic({
      name: `PW List Items Topic ${suffix}`,
      slug: `pw-list-items-topic-${suffix}`,
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `PW List Items Feed ${suffix}` })
    const { id: rssFeedItemId } = await createTestRssFeedItemWithUrl(feedId)
    const list = await insertTestList({ ownerUserId: user.id, name: `PW Items ${suffix}` })
    await insertTestListRssFeedItem({ listId: list.id, rssFeedItemId })
    await navigateTo(page, `/list/${list.id}`)
    await expect(page.getByTestId('list-items')).toBeVisible()
    await expect(page.getByTestId('list-item-row')).toBeVisible()
  })
})

// --- list pagination continuation ---
// The shared continuation renders only when has_next_page is true. Default page size
// is 20, so 21 items are seeded to guarantee a second page.
test.describe('List detail page — load more', () => {
  let loadMoreListId: string

  test.beforeAll(async () => {
    const user = await createTestUser()
    const suffix = randomSuffix()
    const topicId = await insertTestTopic({
      name: `PW Load More Topic ${suffix}`,
      slug: `pw-load-more-topic-${suffix}`,
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `PW Load More Feed ${suffix}` })
    const list = await insertTestList({
      ownerUserId: user.id,
      name: `PW Load More ${suffix}`,
      visibility: 'public',
    })
    loadMoreListId = list.id
    for (let i = 0; i < 21; i++) {
      const { id: rssFeedItemId } = await createTestRssFeedItemWithUrl(feedId)
      await insertTestListRssFeedItem({ listId: loadMoreListId, rssFeedItemId })
    }
  })

  test.use({ storageState: AUTH_STATE })

  test('load-more control is visible when list has more than one page of items', async ({
    page,
  }) => {
    await navigateTo(page, `/list/${loadMoreListId}`)
    const continuation = page.getByTestId('paginated-list-continuation')
    await expect(continuation).toBeVisible()
    await expect(continuation.getByRole('button', { name: 'Load more' })).toBeVisible()
  })
})

// --- add-to-list-dialog, add-to-list-checklist ---
// AddToListDialog renders inside the kebab menu on mobile. add-to-list-checklist
// only renders when the current user has at least one list, so one is seeded
// for the shared test user in beforeAll.
test.describe('Add to List dialog — mobile', () => {
  test.use({
    storageState: AUTH_STATE,
    viewport: MOBILE_VIEWPORTS['iphone-se'],
  })

  test.beforeAll(async () => {
    await insertTestList({
      ownerUserId: TEST_USER_ID,
      name: `PW Add-to-List ${randomSuffix()}`,
    })
  })

  test('add-to-list-dialog and add-to-list-checklist are visible after clicking menu item', async ({
    page,
  }) => {
    await navigateTo(page, '/news')
    await page.getByTestId('news-item-show-more-link').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByTestId('rss-feed-item-modal-more-actions-button').click()
    await page.getByTestId('add-to-list-menu-item').click()
    await expect(page.getByTestId('add-to-list-dialog')).toBeVisible()
    await expect(page.getByTestId('add-to-list-dialog')).toHaveAccessibleDescription(
      'Choose which of your lists include this feed item.',
    )
    await expect(page.getByTestId('add-to-list-checklist')).toBeVisible()
  })
})
