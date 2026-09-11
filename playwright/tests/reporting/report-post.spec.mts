import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { createTestUser, insertTestPost } from '../../../backend/test-helpers/index.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

let targetUserId = ''
let postSlug = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const target = await createTestUser({ username: `rpt-post-target-${suffix}` })
  if (!target) throw new Error('Failed to create target user')
  targetUserId = target.id

  postSlug = `rpt-post-${suffix}`
  await insertTestPost({
    title: `Report post test post ${suffix}`,
    slug: postSlug,
    createdById: target.id,
    markdown: 'Post used for report post test.',
  })
})

test.describe('Report post — full flow', () => {
  test.use({ storageState: AUTH_STATE })

  test('signed-in non-owner can report a post via the kebab menu using vote_manipulation reason', async ({
    page,
  }) => {
    await navigateTo(page, '/discussions?sort=new')
    await waitForBelowFoldHydration(page)

    const seededCard = page
      .getByTestId('post-card-root')
      .and(page.locator(`[data-post-slug="${postSlug}"]`))
      .first()

    const kebabButton = seededCard.getByTestId('post-card-report-button')
    await expect(kebabButton).toBeVisible({ timeout: 10_000 })
    await kebabButton.click()

    const reportMenuItem = page.getByTestId('report-menu-item')
    await expect(reportMenuItem).toBeVisible()
    await reportMenuItem.click()

    const dialog = page.getByTestId('report-dialog')
    await expect(dialog).toBeVisible()

    const voteManipulationRadio = dialog.getByTestId('report-reason-vote-manipulation')
    await expect(voteManipulationRadio).toBeVisible()
    await voteManipulationRadio.click()

    const submitButton = dialog.getByTestId('report-submit')
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    await expect(dialog.getByTestId('report-success-message')).toBeVisible()
  })
})

test.describe('Report post — self-report guard', () => {
  test('post author does not see report button on their own post card', async ({ page }) => {
    await loginAsUser(page, targetUserId)
    await navigateTo(page, '/discussions?sort=new')
    await waitForBelowFoldHydration(page)

    const seededCard = page
      .getByTestId('post-card-root')
      .and(page.locator(`[data-post-slug="${postSlug}"]`))
      .first()

    await expect(seededCard).toBeVisible({ timeout: 10_000 })
    await expect(seededCard.getByTestId('post-card-report-button')).toBeHidden()
  })
})
