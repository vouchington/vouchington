import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestCommunityPostReview,
} from '../../../backend/test-helpers/index.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'

const SEEDED_DISCUSSION_ID = '019c64e6-f720-7001-a001-000000000001'

let COMMUNITY_ID = ''
let COMMUNITY_SLUG = ''
let COMMUNITY_NAME = ''

function communityHasPost(page: Page, title: string) {
  return page.evaluate(
    async ({ slug, postTitle }: { postTitle: string; slug: string }) => {
      const res = await fetch(`/api/v1/communities/${slug}/posts?limit=100`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Community posts search failed: ${res.status}`)
      const data = (await res.json()) as { posts?: Record<string, { title: string }> }
      return Object.values(data.posts ?? {}).some(post => post.title === postTitle)
    },
    { postTitle: title, slug: COMMUNITY_SLUG },
  )
}

test.describe('Community Posts', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    COMMUNITY_SLUG = `pw-community-posts-${suffix}`
    // The communities API defaults to name ASC; this keeps the fresh fixture first on dirty DBs.
    const sortPrefix = String(Number.MAX_SAFE_INTEGER - Date.now()).padStart(16, '0')
    COMMUNITY_NAME = `000 ${sortPrefix} PW Community Posts ${suffix}`

    const community = await insertTestCommunity({
      name: COMMUNITY_NAME,
      slug: COMMUNITY_SLUG,
      createdById: TEST_USER_ID,
    })
    COMMUNITY_ID = community.id
    await insertTestCommunityMember({
      communityId: community.id,
      userId: TEST_USER_ID,
      role: 'owner',
    })
  })

  test('creates a community post without adding it to global discussions', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}/posts/create`)
    await waitForBelowFoldHydration(page)

    const title = `Community-only discussion ${randomSuffix()}`
    await page.getByTestId('post-form-title-input').fill(title)
    await page
      .getByTestId('post-form-content-textarea')
      .fill('This discussion belongs only to the community.')
    await page.getByTestId('post-form-submit').click()

    await expect(page.getByTestId('post-detail-heading')).toContainText(title)
    expect(await communityHasPost(page, title)).toBe(true)

    const appearsInGlobal = await page.evaluate(async (query: string) => {
      const res = await fetch(`/api/v1/posts?q=${encodeURIComponent(query)}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Global search failed: ${res.status}`)
      const data = (await res.json()) as { posts?: Record<string, { title: string }> }
      return Object.values(data.posts ?? {}).some(post => post.title === query)
    }, title)
    expect(appearsInGlobal).toBe(false)
  })

  test('starts a community discussion from a global post', async ({ page }) => {
    await navigateTo(page, `/discussion/${SEEDED_DISCUSSION_ID}`)
    await waitForBelowFoldHydration(page)
    const discussButton = page.getByTestId('discuss-in-community-button')
    await expect(discussButton).toBeVisible()
    await discussButton.click()
    const communitySelect = page.getByTestId('discuss-in-community-select')
    await expect(communitySelect).toBeEnabled()
    await communitySelect.click()
    const communityOption = page.locator(
      `[data-pw="discuss-in-community-option-${COMMUNITY_SLUG}"]`,
    )
    await expect(communityOption).toBeAttached()
    await communityOption.evaluate(element => {
      element.scrollIntoView({ block: 'center' })
      const htmlElement = element as HTMLElement
      htmlElement.click()
    })
    await expect(communitySelect).toContainText(COMMUNITY_NAME)
    await page.getByTestId('discuss-in-community-submit').click()

    await expect(page.getByTestId('post-detail-heading')).toContainText('Discuss:')
    await expect(
      page.getByTestId('post-detail-content').getByRole('link', { name: 'Source post' }),
    ).toBeVisible()
  })

  test('community owner can unpublish a community post', async ({ page }) => {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `Unpublish Test ${suffix}`,
      slug: `pw-unpublish-${suffix}`,
      createdById: TEST_USER_ID,
      markdown: 'Test unpublish from community.',
      communityId: COMMUNITY_ID,
    })
    await insertTestCommunityPostReview({ communityId: COMMUNITY_ID, postId })

    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    expect(await communityHasPost(page, `Unpublish Test ${suffix}`)).toBe(true)
    const communityLabel = page.getByTestId('post-card-community-label').first()
    await expect(communityLabel).toBeVisible()
    await expect(communityLabel).toHaveAttribute('href', `/communities/${COMMUNITY_SLUG}`)

    await navigateTo(page, `/discussion/${postId}`)
    await waitForBelowFoldHydration(page)

    // Open the overflow kebab to reveal the unpublish trigger
    await page.getByTestId('post-detail-overflow-trigger').click()

    const unpublishTrigger = page.getByTestId('post-unpublish-from-community-trigger')
    await expect(unpublishTrigger).toBeVisible()
    await unpublishTrigger.click()

    const dialog = page.getByTestId('post-unpublish-from-community-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('post-unpublish-from-community-confirm').click()
    await expect(dialog).toBeHidden()

    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    expect(await communityHasPost(page, `Unpublish Test ${suffix}`)).toBe(false)
  })

  test('shows Hot and New sort options on the community posts page', async ({ page }) => {
    await navigateTo(page, `/communities/${COMMUNITY_SLUG}`)
    await waitForBelowFoldHydration(page)

    await page.getByTestId('list-filters-sort-trigger').press(' ')
    await expect(page.getByTestId('list-filters-sort-option-hot')).toBeVisible()
    await expect(page.getByTestId('list-filters-sort-option-new')).toBeVisible()
    await page.getByTestId('list-filters-sort-option-hot').click()

    await expect(page).toHaveURL(new RegExp(`/communities/${COMMUNITY_SLUG}\\?sort=hot`))
  })
})
