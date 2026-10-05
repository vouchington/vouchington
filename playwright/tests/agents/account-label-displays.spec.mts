import { test, expect, type Locator } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

// Seeded by backend/scripts/seeds/playwright-test-data/post-account-labels.mts: one discussion,
// one comment and one share per account. Every comment and share targets the member's
// discussion, and the viewer follows every author.
const VIEWER_ID = '019d0000-0000-7000-8000-0000000001a2'
const VIEWER_USERNAME = 'pw-label-viewer'
const MEMBER_POST_ID = '019c64e6-f760-7001-a001-000000000001'
const ACCOUNTS = [
  { username: 'pw-label-member', label: null, postId: MEMBER_POST_ID },
  { username: 'jong', label: 'Official', postId: '019c64e6-f760-7001-a001-000000000002' },
  { username: 'system', label: 'System', postId: '019c64e6-f760-7001-a001-000000000003' },
  { username: 'test-reviewer', label: 'AI Agent', postId: '019c64e6-f760-7001-a001-000000000004' },
] as const

// Callers assert a visible anchor inside the same scope first, so a mis-scoped locator cannot
// satisfy the no-badge case for the ordinary member.
async function expectAccountLabel(scope: Locator, username: string, label: string | null) {
  const badge = scope.getByTestId('user-account-badge')
  if (label === null) {
    await expect(badge, `${username} shows no account label`).toHaveCount(0)
    return
  }
  await expect(badge, `${username} shows ${label}`).toHaveText(label)
}

test.describe('Author account labels outside the profile header', () => {
  test('shows the label on post cards in a profile discussion list', async ({ page }) => {
    for (const { username, label } of ACCOUNTS) {
      await navigateTo(page, `/user/${username}/discussions`)
      const card = page
        .getByTestId('post-card-root')
        .filter({ hasText: `Account label discussion by ${username}` })
      await expect(card.getByTestId('post-card-title-link')).toBeVisible()
      await expectAccountLabel(card, username, label)
    }
  })

  test('shows the label in the post detail byline', async ({ page }) => {
    for (const { username, label, postId } of ACCOUNTS) {
      await navigateTo(page, `/discussion/${postId}`)
      const byline = page.getByTestId('post-detail-byline-link')
      await expect(byline).toBeVisible()
      await expectAccountLabel(byline.locator('..'), username, label)
    }
  })

  test('shows the label in each comment header', async ({ page }) => {
    await navigateTo(page, `/discussion/${MEMBER_POST_ID}`)
    for (const { username, label } of ACCOUNTS) {
      const comment = page.getByTestId('comment-node').filter({
        has: page
          .getByTestId('comment-node-content')
          .filter({ hasText: `Account label comment by ${username}` }),
      })
      await expect(comment.getByTestId('comment-node-content')).toBeVisible()
      await expectAccountLabel(comment, username, label)
    }
  })

  test('shows the label in the shared byline for a signed-in recipient', async ({ page }) => {
    await loginAsUser(page, VIEWER_ID)
    await navigateTo(page, '/feed/posts/friends')
    for (const { username, label } of ACCOUNTS) {
      const sharer = page.getByTestId('shared-byline-user-link').filter({ hasText: `@${username}` })
      await expect(sharer).toBeVisible()
      await expectAccountLabel(sharer.locator('..'), username, label)
    }
  })

  test('shows the label in the following user list', async ({ page }) => {
    await navigateTo(page, `/user/${VIEWER_USERNAME}/users/following`)
    for (const { username, label } of ACCOUNTS) {
      const item = page
        .getByTestId('user-list-item')
        .filter({ has: page.getByText(`@${username}`, { exact: true }) })
      await expect(item).toBeVisible()
      await expectAccountLabel(item, username, label)
    }
  })
})
