import { expect, test } from '../../helpers/test.mts'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '../../../backend/test-helpers/index.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
let rejectedTitle = ''
let inReviewTitle = ''
let approveTitle = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  const author = await createTestUser({ username: `review-queue-pw-${suffix}` })
  if (!author) throw new Error('Failed to create review queue author')

  rejectedTitle = `Playwright rejected ${suffix}`
  inReviewTitle = `Playwright in review ${suffix}`
  approveTitle = `Playwright approve ${suffix}`

  const rejectedPostId = await insertTestPost({
    title: rejectedTitle,
    slug: `playwright-rejected-${suffix}`,
    createdById: author.id,
    markdown: 'Rejected post for the admin review queue smoke test.',
    clearanceStatus: 'rejected',
  })
  const rejectedImageId = await insertTestImage(author.id)
  await insertTestPostImage({ postId: rejectedPostId, imageId: rejectedImageId })
  await insertTestPost({
    title: inReviewTitle,
    slug: `playwright-in-review-${suffix}`,
    createdById: author.id,
    markdown: 'In-review post for the admin review queue smoke test.',
    clearanceStatus: 'in_review',
  })
  await insertTestPost({
    title: approveTitle,
    slug: `playwright-approve-${suffix}`,
    createdById: author.id,
    markdown: 'Rejected post for approve test.',
    clearanceStatus: 'rejected',
  })
})

test.describe('Admin review queue', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin can view queued posts', async ({ page }) => {
    await navigateTo(page, '/posts/review-queue')

    await expect(page.getByTestId('review-queue-heading')).toBeVisible()
    await expect(
      page.getByTestId('review-queue-post-title').filter({ hasText: rejectedTitle }),
    ).toBeVisible()
    await expect(
      page.getByTestId('review-queue-post-title').filter({ hasText: inReviewTitle }),
    ).toBeVisible()
    const rejectedRow = page.getByRole('row').filter({ hasText: rejectedTitle })
    await expect(rejectedRow.getByTestId('review-queue-media')).toBeVisible()
    const approveBtn = page
      .getByRole('row')
      .filter({ hasText: rejectedTitle })
      .getByTestId('review-queue-approve')
    await expect(approveBtn).toBeVisible()
  })

  test('admin can mark a post for re-review', async ({ page }) => {
    await navigateTo(page, '/posts/review-queue')

    await expect(
      page.getByTestId('review-queue-post-title').filter({ hasText: rejectedTitle }),
    ).toBeVisible()

    const row = page.getByRole('row').filter({ hasText: rejectedTitle })
    const markForReviewButton = row.getByTestId('mark-for-review')
    await expect(markForReviewButton).toBeVisible()
    await markForReviewButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    const [request] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/clearances') && r.method() === 'POST'),
      markForReviewButton.click(),
    ])

    expect(request.postDataJSON()).toEqual({ status: 'in_review' })
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Post marked for re-review' }),
    ).toBeVisible()
  })

  test('admin approves a rejected post', async ({ page }) => {
    await navigateTo(page, '/posts/review-queue')

    const titleLocator = page
      .getByTestId('review-queue-post-title')
      .filter({ hasText: approveTitle })
    await expect(titleLocator).toBeVisible()

    const row = page.getByRole('row').filter({ hasText: approveTitle })
    const approveButton = row.getByTestId('review-queue-approve')
    await expect(approveButton).toBeVisible()
    await approveButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    await approveButton.click()

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Post approved' }),
    ).toBeVisible()
    await expect(titleLocator).not.toBeAttached()
  })

  test('admin rejects an in-review post', async ({ page }) => {
    await navigateTo(page, '/posts/review-queue')

    const titleLocator = page
      .getByTestId('review-queue-post-title')
      .filter({ hasText: inReviewTitle })
    await expect(titleLocator).toBeVisible()

    const row = page.getByRole('row').filter({ hasText: inReviewTitle })
    const rejectButton = row.getByTestId('review-queue-reject')
    await expect(rejectButton).toBeVisible()
    await rejectButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    await rejectButton.click()

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Post rejected' }),
    ).toBeVisible()
  })
})
