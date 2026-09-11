import { expect, test } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { blockUser, createTestUser, muteUser } from '../../../backend/test-helpers/index.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

function randomUsernameSuffix(): string {
  return randomSuffix().replaceAll(/[0-9]/g, digit =>
    String.fromCodePoint('a'.codePointAt(0)! + Number(digit)),
  )
}

test.describe('Blocked and muted user lists', () => {
  test('blocked users list shows the blocked user', async ({ page }) => {
    const suffix = randomUsernameSuffix()
    const viewer = await withCleanUser(page, {
      username: `bl-viewer-${suffix}`,
    })

    const target = requireTestValue(
      await createTestUser({ username: `bl-target-${suffix}` }),
      'Failed to create block target user',
    )

    await blockUser(viewer, target)

    await navigateTo(page, `/user/${viewer.username}/users/blocked`)

    await expect(
      page.getByTestId('user-list-item').filter({ hasText: `@${target.username}` }),
    ).toBeVisible()
  })

  test('muted users list shows the muted user', async ({ page }) => {
    const suffix = randomUsernameSuffix()
    const viewer = await withCleanUser(page, {
      username: `mu-viewer-${suffix}`,
    })

    const target = requireTestValue(
      await createTestUser({ username: `mu-target-${suffix}` }),
      'Failed to create mute target user',
    )

    await muteUser(viewer, target)

    await navigateTo(page, `/user/${viewer.username}/users/muted`)

    await expect(
      page.getByTestId('user-list-item').filter({ hasText: `@${target.username}` }),
    ).toBeVisible()
  })

  test('blocked users list shows empty state when no blocked users', async ({ page }) => {
    const suffix = randomUsernameSuffix()
    const viewer = await withCleanUser(page, {
      username: `bl-empty-viewer-${suffix}`,
    })

    await navigateTo(page, `/user/${viewer.username}/users/blocked`)

    await expect(page.getByTestId('empty-state')).toBeVisible()
    await expect(page.getByTestId('empty-state-title')).toContainText('No blocked users')
  })

  test('muted users list shows empty state when no muted users', async ({ page }) => {
    const suffix = randomUsernameSuffix()
    const viewer = await withCleanUser(page, {
      username: `mu-empty-viewer-${suffix}`,
    })

    await navigateTo(page, `/user/${viewer.username}/users/muted`)

    await expect(page.getByTestId('empty-state')).toBeVisible()
    await expect(page.getByTestId('empty-state-title')).toContainText('No muted users')
  })
})
