import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { insertTestPost, createTestUser } from '../../../backend/test-helpers/index.mts'
import { lockPost } from '../../../backend/services/posts/lock.mts'

// The shared seeded test user (admin-capable, owns AUTH_STATE session)
const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

let suffix = ''
let nonAuthorId: string

test.beforeAll(async () => {
  // A beforeAll can re-run in the same worker process when Playwright's
  // fullyParallel scheduler hands the worker a second test from this file —
  // module scope is preserved across that re-entry. Generating the suffix
  // here (not at module scope) guarantees a fresh, non-colliding value on
  // every entry, since users.username is a globally unique key.
  suffix = randomSuffix()
  const nonAuthor = await createTestUser({ username: `pw-post-lock-other-${suffix}` })
  if (!nonAuthor) throw new Error('Failed to create non-author user')
  nonAuthorId = nonAuthor.id
})

test.describe('Post Lock — author/admin', () => {
  test.use({ storageState: AUTH_STATE })

  test('author (admin) sees Lock button and can lock the post; locked badge appears', async ({
    page,
  }) => {
    const postId = await insertTestPost({
      title: `Post Lock UI test ${suffix}`,
      slug: `pw-post-lock-ui-${suffix}`,
      createdById: TEST_USER_ID,
      markdown: 'Post for lock UI test.',
      postType: 'discussion',
    })

    await navigateTo(page, `/discussion/${postId}`)

    await waitForBelowFoldHydration(page)
    // Open the overflow kebab to reveal the lock toggle
    await page.getByTestId('post-detail-overflow-trigger').click()

    const lockButton = page.getByTestId('post-detail-lock-button')
    await expect(lockButton).toBeVisible()
    await expect(lockButton).toHaveText('Lock')
    await expect(lockButton).toHaveAttribute('title', 'Prevent new replies to this thread')

    await lockButton.click()

    // Clicking the lock menu item closes the dropdown (no dialog, so onSelect closes naturally).
    // Assert the badge first, then re-open the kebab to verify the toggle flipped.
    await expect(page.getByTestId('post-detail-badge-locked')).toBeVisible()
    await page.getByTestId('post-detail-overflow-trigger').click()
    await expect(lockButton).toHaveText('Unlock')
    await expect(lockButton).toHaveAttribute('title', 'Allow new replies to this thread')
  })
})

test.describe('Post Lock — non-author', () => {
  test('non-author does not see Lock button', async ({ page }) => {
    const postId = await insertTestPost({
      title: `Post Lock nonauth test ${suffix}`,
      slug: `pw-post-lock-nonauth-${suffix}`,
      createdById: TEST_USER_ID,
      markdown: 'Post for non-author lock test.',
      postType: 'discussion',
    })

    await loginAsUser(page, nonAuthorId)
    await navigateTo(page, `/discussion/${postId}`)

    await waitForBelowFoldHydration(page)
    await expect(page.getByTestId('post-detail-lock-button')).toHaveCount(0)
  })

  test('locked badge visible to non-author on a pre-locked post', async ({ page }) => {
    const postId = await insertTestPost({
      title: `Pre-locked post ${suffix}`,
      slug: `pw-post-prelocked-badge-${suffix}`,
      createdById: TEST_USER_ID,
      markdown: 'This post is pre-locked.',
      postType: 'discussion',
    })
    await lockPost(postId, TEST_USER_ID)

    await loginAsUser(page, nonAuthorId)
    await navigateTo(page, `/discussion/${postId}`)

    await expect(page.getByTestId('post-detail-badge-locked')).toBeVisible()
    await expect(page.getByTestId('post-detail-lock-button')).toHaveCount(0)
  })
})
