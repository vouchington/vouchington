import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { voteTrigger } from '../../helpers/semantic-vote.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

// Seeded hostname from playwright-test-data — example.com with a crawler attached
const SEEDED_HOSTNAME = 'example.com'

test.describe('Domain Voting', () => {
  let contributorId: string

  test.beforeAll(async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor) throw new Error('Failed to create domain voting contributor')
    contributorId = contributor.id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, contributorId)
  })

  test('signed-in user: vote component is visible on domain detail page', async ({ page }) => {
    await navigateTo(page, `/domain/${SEEDED_HOSTNAME}`)

    await expect(voteTrigger(page, 'hostname-vouch-disavow-vote')).toBeVisible()
  })

  test('anonymous user: vote controls render on domain detail page', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/domain/${SEEDED_HOSTNAME}`)

    const voteComponent = page.getByTestId('hostname-vouch-disavow-vote')
    await expect(voteComponent).toBeVisible()
  })

  test('anonymous user: vote buttons link to login when signed out', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/domain/${SEEDED_HOSTNAME}`)

    const signedOutLinks = page.getByTestId('hostname-vouch-disavow-vote-sign-in')
    await expect(signedOutLinks.first()).toBeVisible()
  })
})
