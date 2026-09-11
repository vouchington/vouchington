import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { createTestUser, insertTestPost } from '../../../backend/test-helpers/index.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

let rootPostId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const target = await createTestUser({ username: `rpt-comment-target-${suffix}` })
  if (!target) throw new Error('Failed to create target user')

  rootPostId = await insertTestPost({
    title: `Report comment test post ${suffix}`,
    slug: `rpt-comment-post-${suffix}`,
    createdById: target.id,
    markdown: 'Post used for report comment test.',
  })

  await insertTestPost({
    title: `Report comment test comment ${suffix}`,
    slug: `rpt-comment-cmt-${suffix}`,
    createdById: target.id,
    markdown: 'Comment used for report comment test.',
    postType: 'comment',
    rootId: rootPostId,
    parentId: rootPostId,
  })
})

test.describe('Report comment', () => {
  test.use({ storageState: AUTH_STATE })

  test('signed-in user can report a comment via the kebab menu', async ({ page }) => {
    await navigateTo(page, `/discussion/${rootPostId}`)

    await waitForBelowFoldHydration(page)

    const kebabButton = page.getByTestId('report-menu-kebab-trigger')
    await expect(kebabButton).toBeVisible({ timeout: 10_000 })
    await kebabButton.click()

    const reportMenuItem = page.getByTestId('report-menu-item')
    await expect(reportMenuItem).toBeVisible()
    await reportMenuItem.click()

    const dialog = page.getByTestId('report-dialog')
    await expect(dialog).toBeVisible()

    const spamRadio = page.getByTestId('report-reason-spam')
    await expect(spamRadio).toBeVisible()
    await spamRadio.click()

    const submitButton = page.getByTestId('report-submit')
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    await expect(dialog.getByTestId('report-success-message')).toBeVisible()
  })
})
