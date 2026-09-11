import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { resetAnonymousBrowserStateBeforeNavigation } from '../../helpers/browser-state.mts'
import { userSignalChoice, voteBinaryChoice, voteClear } from '../../helpers/semantic-vote.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

const SCREENSHOT_DIR = process.env.TMPDIR ?? tmpdir()
const SCREENSHOT_PATH = join(SCREENSHOT_DIR, 'vouch-disavow-aside.png')

test.describe('User vouch/disavow asides', () => {
  let contributorId: string
  let targetUsername: string

  test.beforeAll(async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor?.id) throw new Error('Failed to create user vouch contributor')
    contributorId = contributor.id
    const target = await createTestUser()
    if (!target?.username) throw new Error('Failed to create user tag target')
    targetUsername = target.username
  })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, contributorId)
  })

  test('signed-in viewer sees vouch controls and manages tags on another profile', async ({
    page,
  }) => {
    await navigateTo(page, `/user/${targetUsername}`)

    const aside = page.getByRole('complementary')

    await expect(aside.getByTestId('user-vouch-election-card')).toBeVisible()
    await expect(aside.getByTestId('user-tags-aside')).toBeVisible()

    await expect(userSignalChoice(aside, 'user-vouch-election-card', 'vouch')).toBeVisible()
    await expect(userSignalChoice(aside, 'user-vouch-election-card', 'disavow')).toBeVisible()

    await aside.getByTestId('user-tags-aside').getByRole('button', { name: 'Manage' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Manage user tags')
    await dialog.getByTestId('publisher-type-select').click()

    const createTagResponse = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/v1/entity-relations/user/') &&
        response.url().endsWith('/category/topic'),
    )
    await page.getByRole('listbox').getByRole('option', { name: 'Bot' }).click()
    await createTagResponse
    await expect(dialog.getByTestId('tag-item-link')).toContainText('Bot')
    await expect(voteBinaryChoice(dialog, 'tag-vote', 'confirm')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(aside.getByTestId('user-tags-aside').getByTestId('tag-item-link')).toContainText(
      'Bot',
    )

    await expect(voteClear(aside.getByTestId('user-tags-aside'), 'tag-vote')).toHaveCount(0)
    const retractVoteResponse = page.waitForResponse(
      response =>
        response.request().method() === 'PUT' &&
        response.url().includes('/api/v1/entity-relations/') &&
        response.url().endsWith('/vote'),
    )
    await voteBinaryChoice(aside.getByTestId('user-tags-aside'), 'tag-vote', 'dispute').click()
    await retractVoteResponse
    await expect(aside.getByTestId('user-tags-aside').getByTestId('tag-item-link')).toHaveCount(0)

    await aside.getByTestId('user-tags-aside').getByRole('button', { name: 'Manage' }).click()
    await expect(dialog.getByTestId('tag-item-link')).toContainText('Bot')
    await expect(voteBinaryChoice(dialog, 'tag-vote', 'confirm')).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    const restoreVoteResponse = page.waitForResponse(
      response =>
        response.request().method() === 'PUT' &&
        response.url().includes('/api/v1/entity-relations/') &&
        response.url().endsWith('/vote'),
    )
    await voteBinaryChoice(dialog, 'tag-vote', 'confirm').click()
    await restoreVoteResponse
    await expect(voteBinaryChoice(dialog, 'tag-vote', 'confirm')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(aside.getByTestId('user-tags-aside').getByTestId('tag-item-link')).toContainText(
      'Bot',
    )

    const disavowButton = userSignalChoice(aside, 'user-vouch-election-card', 'disavow')
    await disavowButton.click()

    // Toast appears in the live-region with the success copy.
    await expect(page.locator('[data-sonner-toast]')).toContainText(
      `Disavowed ${targetUsername}, unfollowed and muted.`,
    )

    // Screenshot the asides for PR attachment (informational only; not a snapshot baseline).
    await aside.screenshot({ path: SCREENSHOT_PATH })
  })

  test('signed-in viewer sees no moderation asides on their own profile', async ({ page }) => {
    await navigateTo(page, `/user/${contributorId}`)

    const aside = page.getByRole('complementary')

    await expect(aside.getByTestId('user-vouch-election-card')).toHaveCount(0)
    await expect(aside.getByTestId('user-tags-aside')).toHaveCount(0)
  })

  test('signed-out viewer does not see user moderation asides', async ({ page }) => {
    await resetAnonymousBrowserStateBeforeNavigation(page)
    await navigateTo(page, `/user/${targetUsername}`)

    const aside = page.getByRole('complementary')
    await expect(aside.getByTestId('user-vouch-election-card')).toHaveCount(0)
    await expect(aside.getByTestId('user-tags-aside')).toHaveCount(0)
  })
})
