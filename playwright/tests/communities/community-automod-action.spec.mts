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

test.beforeAll(async () => {
  const suffix = randomSuffix()
  const owner = await createTestUser({ username: `automod-action-owner-${suffix}` })
  if (!owner) throw new Error('Failed to create owner')

  ownerUserId = owner.id
  communitySlug = `automod-action-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Automod Action ${suffix}`,
    visibility: 'public',
  })
  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
})

test.describe('community automod action', () => {
  test('owner chooses what a flag does and the choice persists', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-automod-action-form')).toBeVisible()
    await expect(page.getByTestId('community-automod-action-record_only')).toBeChecked()
    await expect(page.getByTestId('community-automod-action-save')).toBeDisabled()

    await page.getByTestId('community-automod-action-review_queue').click()
    const saved = page.waitForResponse(
      resp => resp.url().includes('/automod-settings') && resp.request().method() === 'PATCH',
    )
    await page.getByTestId('community-automod-action-save').click()
    expect((await saved).ok()).toBe(true)

    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)
    await expect(page.getByTestId('community-automod-action-review_queue')).toBeChecked()
    await expect(page.getByTestId('community-automod-action-unpublish')).not.toBeChecked()
  })
})
