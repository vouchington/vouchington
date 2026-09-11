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
let moderatorUserId = ''
let communitySlug = ''
let vacationResetOwnerUserId = ''
let vacationResetCommunitySlug = ''

// Declared before registerDigestSuppressionTest (a hoisted function declaration) so this hook
// isn't preceded, in source order, by any test() call — see playwright/prefer-hooks-on-top.
test.beforeAll(async () => {
  const suffix = randomSuffix()
  const owner = await createTestUser({ username: `vacation-owner-${suffix}` })
  const moderator = await createTestUser({ username: `vacation-moderator-${suffix}` })
  if (!owner) throw new Error('Failed to create owner')
  if (!moderator) throw new Error('Failed to create moderator')

  ownerUserId = owner.id
  moderatorUserId = moderator.id
  communitySlug = `vacation-test-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Vacation Test ${suffix}`,
    visibility: 'public',
  })
  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: moderator.id,
    role: 'moderator',
  })

  const vacationResetOwner = await createTestUser({ username: `vacation-reset-owner-${suffix}` })
  if (!vacationResetOwner) throw new Error('Failed to create vacation reset owner')
  vacationResetOwnerUserId = vacationResetOwner.id
  vacationResetCommunitySlug = `vacation-reset-${suffix}`
  const vacationResetCommunity = await insertTestCommunity({
    createdById: vacationResetOwner.id,
    slug: vacationResetCommunitySlug,
    name: `Vacation Reset Test ${suffix}`,
    visibility: 'public',
  })
  await insertTestCommunityMember({
    communityId: vacationResetCommunity.id,
    userId: vacationResetOwner.id,
    role: 'owner',
  })
})

function registerDigestSuppressionTest(role: string, getUserId: () => string) {
  test(`${role} can persist digest suppression independently of vacation`, async ({ page }) => {
    await loginAsUser(page, getUserId())
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    const suppression = page.getByRole('switch', {
      name: 'Pause community digests while on vacation',
    })
    await expect(suppression).not.toBeChecked()
    const patchOn = page.waitForResponse(
      response =>
        response.ok() &&
        response.url().includes('/moderator-vacation') &&
        response.request().method() === 'PATCH',
    )
    await suppression.click()
    await patchOn
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)
    await expect(suppression).toBeChecked()

    const vacation = page.getByTestId('mod-vacation-toggle')
    const put = page.waitForResponse(
      response =>
        response.ok() &&
        response.url().includes('/moderator-vacation') &&
        response.request().method() === 'PUT',
    )
    await vacation.click()
    await put
    await expect(suppression).toBeChecked()

    const remove = page.waitForResponse(
      response =>
        response.ok() &&
        response.url().includes('/moderator-vacation') &&
        response.request().method() === 'DELETE',
    )
    await vacation.click()
    await remove
    await expect(suppression).toBeChecked()

    const patchOff = page.waitForResponse(
      response =>
        response.ok() &&
        response.url().includes('/moderator-vacation') &&
        response.request().method() === 'PATCH',
    )
    await suppression.click()
    await patchOff
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)
    await expect(suppression).not.toBeChecked()
  })
}

test.describe('moderator vacation mode', () => {
  test('vacation panel is visible on moderation settings page', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('mod-vacation-heading')).toBeVisible()
    await expect(page.getByTestId('mod-vacation-toggle')).toBeVisible()
    await expect(page.getByTestId('mod-vacation-duration')).toBeHidden()
  })

  test('toggling vacation on shows duration picker and sends PUT request', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    const putDone = page.waitForResponse(
      resp => resp.url().includes('/moderator-vacation') && resp.request().method() === 'PUT',
    )
    await page.getByTestId('mod-vacation-toggle').click()
    await putDone

    await expect(page.getByTestId('mod-vacation-duration')).toBeVisible()

    const deleteDone = page.waitForResponse(
      resp =>
        resp.ok() &&
        resp.url().includes('/moderator-vacation') &&
        resp.request().method() === 'DELETE',
    )
    await page.getByTestId('mod-vacation-toggle').click()
    await deleteDone
    await expect(page.getByTestId('mod-vacation-duration')).toBeHidden()
  })

  test('toggling vacation off sends DELETE request', async ({ page }) => {
    await loginAsUser(page, vacationResetOwnerUserId)
    await navigateTo(page, `/communities/${vacationResetCommunitySlug}/settings/moderation`)

    const durationPicker = page.getByTestId('mod-vacation-duration')
    const putDone = page.waitForResponse(
      resp =>
        resp.ok() &&
        resp.url().includes('/moderator-vacation') &&
        resp.request().method() === 'PUT',
    )
    await page.getByTestId('mod-vacation-toggle').click()
    await putDone
    await expect(durationPicker).toBeVisible()

    // Now turn off
    const deleteDone = page.waitForResponse(
      resp => resp.url().includes('/moderator-vacation') && resp.request().method() === 'DELETE',
    )
    await page.getByTestId('mod-vacation-toggle').click()
    await deleteDone

    await expect(durationPicker).toBeHidden()
  })

  registerDigestSuppressionTest('Community Owner', () => ownerUserId)
  registerDigestSuppressionTest('Community Moderator', () => moderatorUserId)
})
