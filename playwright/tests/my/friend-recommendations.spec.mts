import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { withCleanUser } from '../../helpers/auth.mts'
import { createTestUserDirect } from '../../../backend/test-helpers/entities/users-direct.mts'
import { insertTestFriend } from '../../../backend/test-helpers/entities/friends.mts'
import {
  connectTestOAuthAccount,
  insertTestOAuthAccount,
} from '../../../backend/test-helpers/entities/oauth-accounts.mts'

test.describe('My Friend Recommendations', () => {
  test.use({ storageState: AUTH_STATE })

  test.describe('Suggestions tab', () => {
    test.beforeEach(async ({ page }) => {
      await navigateTo(page, '/my/friend-recommendations')
    })

    test('displays page heading', async ({ page }) => {
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Find Friends')
    })

    test('displays page description', async ({ page }) => {
      await expect(page.getByTestId('friend-recommendations-description')).toBeVisible()
    })

    test('description contains link to identity page social section', async ({ page }) => {
      await expect(page.getByTestId('friend-recommendations-identity-link')).toBeVisible()
      await expect(page.getByTestId('friend-recommendations-identity-link')).toHaveAttribute(
        'href',
        '/my/identity#social',
      )
    })

    test('empty state contains link to identity social section', async ({ page }) => {
      const emptyLink = page.getByTestId('friend-recommendations-empty-identity-link')
      await expect(emptyLink).toBeVisible()
      await expect(emptyLink).toHaveAttribute('href', '/my/identity#social')
    })

    test('does not show settings nav', async ({ page }) => {
      await expect(page.getByLabel('Settings navigation')).toBeHidden()
    })

    test('shows Suggestions tab as active', async ({ page }) => {
      await expect(page.getByTestId('find-friends-tab-suggestions')).toHaveAttribute(
        'aria-current',
        'page',
      )
    })

    test('shows Dismissed tab', async ({ page }) => {
      await expect(page.getByTestId('find-friends-tab-dismissed')).toBeVisible()
    })
  })

  test.describe('Suggestions with a recommendation', () => {
    test('shows follow and dismiss controls', async ({ page }) => {
      const user = await withCleanUser(page)
      const friend = await createTestUserDirect()
      const userGithubId = `pw-friend-${randomSuffix()}`
      const friendGithubId = `pw-friend-${randomSuffix()}`
      await insertTestOAuthAccount('github', userGithubId, null)
      await connectTestOAuthAccount('github', user.id, userGithubId)
      await insertTestOAuthAccount('github', friendGithubId, null)
      await connectTestOAuthAccount('github', friend!.id, friendGithubId)
      await insertTestFriend('github', userGithubId, friendGithubId)
      await navigateTo(page, '/my/friend-recommendations')

      await expect(page.getByTestId('friend-recommendations-list-follow')).toBeVisible()
      await expect(page.getByTestId('friend-recommendations-list-dismiss')).toBeVisible()
    })
  })

  test.describe('Dismissed tab', () => {
    test.beforeEach(async ({ page }) => {
      await navigateTo(page, '/my/friend-recommendations/dismissed')
    })

    test('shows Dismissed tab as active', async ({ page }) => {
      await expect(page.getByTestId('find-friends-tab-dismissed')).toHaveAttribute(
        'aria-current',
        'page',
      )
    })

    test('shows dismissed page content', async ({ page }) => {
      await expect(page.getByTestId('find-friends-dismissed-page')).toBeVisible()
    })
  })

  test.describe('dismissed-recommendations redirect', () => {
    test('redirects /my/users/dismissed-recommendations to dismissed tab', async ({ page }) => {
      await navigateTo(page, '/my/users/dismissed-recommendations')
      await expect(page).toHaveURL('/my/friend-recommendations/dismissed')
    })
  })
})
