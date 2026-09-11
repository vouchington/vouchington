import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '../../../backend/test-helpers/index.mts'

let ownerUserId = ''
let communitySlug = ''
let communityId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  const owner = await createTestUser({ username: `raid-mode-owner-${suffix}` })
  if (!owner) throw new Error('Failed to create owner')

  ownerUserId = owner.id
  communitySlug = `raid-mode-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Raid Mode ${suffix}`,
    visibility: 'public',
  })
  communityId = community.id
  await insertTestCommunityMember({ communityId, userId: owner.id, role: 'owner' })
})

test.describe('community raid mode', () => {
  test('owner activates and lifts temporary restrictions', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-raid-mode-heading')).toBeVisible()
    await expect(page.getByTestId('community-raid-mode-empty')).toBeVisible()

    await page.getByTestId('community-raid-mode-reason').pressSequentially('Playwright raid mode')

    const activateDone = page.waitForResponse(
      resp => resp.url().includes('/restrictions') && resp.request().method() === 'POST',
    )
    await page.getByTestId('community-raid-mode-activate').click()
    await activateDone

    await expect(page.getByTestId('community-raid-mode-active-row')).toHaveCount(2)
    await expect(page.getByTestId('community-raid-mode-lift-all')).toBeVisible()

    const liftDone = page.waitForResponse(
      resp => resp.url().includes('/restrictions/') && resp.request().method() === 'DELETE',
    )
    await page.getByTestId('community-raid-mode-lift').first().click()
    await liftDone

    await expect(page.getByTestId('community-raid-mode-active-row')).toHaveCount(1)
  })
})
