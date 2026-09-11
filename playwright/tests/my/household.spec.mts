import { createTestUserDirect } from '../../../backend/test-helpers/entities/users-direct.mts'
import {
  deleteOwnedHouseholdsForTestUser,
  insertTestHousehold,
  insertTestHouseholdMembership,
} from '../../../backend/test-helpers/entities/households.mts'
import type { PrivateUser } from '../../../backend/services/users/types.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { test, expect, type Page } from '../../helpers/test.mts'
import { MOBILE_VIEWPORTS } from '../../helpers/viewport-constants.mts'

const OLDER = new Date('2026-07-01T00:00:00Z')
const NEWER = new Date('2026-07-02T00:00:00Z')

async function createHouseholdUser(username?: string): Promise<PrivateUser> {
  const user = await createTestUserDirect(
    username === undefined ? { noUsername: true } : { username },
  )
  if (!user?.individual_id) throw new Error('Expected household test user to have an individual')
  await deleteOwnedHouseholdsForTestUser(user.id)
  return user
}

async function addMember(
  householdId: string,
  user: PrivateUser,
  relationship?: string | null,
  updatedAt = NEWER,
) {
  return insertTestHouseholdMembership({
    householdId,
    individualId: user.individual_id!,
    relationship,
    updatedAt,
  })
}

async function loginAndOpenHousehold(page: Page, user: PrivateUser) {
  await loginAsUser(page, user.id)
  await navigateTo(page, '/my/household')
  await expect(page.getByTestId('household-manager')).toBeVisible()
}

test.describe('My Household', () => {
  test('manages only the newest owned household and renders every shared household read-only', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const viewer = await createHouseholdUser(`hh-viewer-${suffix}`)
    const managedMember = await createHouseholdUser(`hh-managed-${suffix}`)
    const olderMember = await createHouseholdUser(`hh-older-${suffix}`)
    const fallbackMember = await createHouseholdUser()
    const sharedOwnerOne = await createHouseholdUser(`hh-owner-a-${suffix}`)
    const sharedOwnerTwo = await createHouseholdUser(`hh-owner-b-${suffix}`)

    const olderOwned = await insertTestHousehold(viewer.id, OLDER)
    const newestOwned = await insertTestHousehold(viewer.id, NEWER)
    const sharedOne = await insertTestHousehold(sharedOwnerOne.id, OLDER)
    const sharedTwo = await insertTestHousehold(sharedOwnerTwo.id, NEWER)
    await addMember(olderOwned.id, olderMember)
    await addMember(newestOwned.id, managedMember, 'Partner')
    await addMember(sharedOne.id, viewer)
    await addMember(sharedOne.id, fallbackMember, ' ')
    await addMember(sharedTwo.id, viewer)

    await loginAndOpenHousehold(page, viewer)

    const manager = page.getByTestId('household-manager')
    const sections = page.getByTestId('household-section')
    await expect(sections).toHaveCount(3)
    await expect(page.getByTestId('household-members-heading')).toHaveCount(3)
    await expect(page.getByTestId('household-members-heading').nth(0)).toHaveText('Your household')
    await expect(page.getByTestId('household-members-heading').nth(1)).toHaveText(
      'Shared household 1',
    )
    await expect(page.getByTestId('household-members-heading').nth(2)).toHaveText(
      'Shared household 2',
    )
    await expect(sections.nth(0)).toContainText(`@${managedMember.username}`)
    await expect(sections.nth(0)).toContainText('Partner')
    await expect(manager).not.toContainText(`@${olderMember.username}`)
    await expect(page.getByTestId('household-read-only-copy')).toHaveCount(2)
    await expect(page.getByTestId('household-remove')).toHaveCount(1)
    await expect(manager).toContainText('Household member')
    await expect(manager).not.toContainText(fallbackMember.individual_id!)
    await expect(manager).not.toContainText(fallbackMember.individual_id!.slice(0, 8))

    const fallbackName = page
      .getByTestId('household-member-name')
      .filter({ hasText: 'Household member' })
    await expect(fallbackName).toHaveText('Household member')
  })

  test('lets a member-only user create an owned household with an empty request body', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const viewer = await createHouseholdUser(`hh-member-${suffix}`)
    const sharedOwner = await createHouseholdUser(`hh-owner-${suffix}`)
    const shared = await insertTestHousehold(sharedOwner.id)
    await addMember(shared.id, viewer)
    await loginAndOpenHousehold(page, viewer)

    await expect(page.getByTestId('household-create-section')).toBeVisible()
    await expect(page.getByTestId('household-read-only-copy')).toBeVisible()
    const createResponse = page.waitForResponse(
      response =>
        new URL(response.url()).pathname === '/api/v1/households' &&
        response.request().method() === 'POST',
    )
    await page.getByTestId('household-create').click()
    const response = await createResponse

    expect(response.request().postDataJSON()).toEqual({})
    await expect(page.getByTestId('household-members-heading').nth(0)).toHaveText('Your household')
    await expect(page.getByTestId('household-read-only-copy')).toBeVisible()
  })

  test('removes optimistically, deduplicates the request, and restores the exact row on failure', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const owner = await createHouseholdUser(`hh-remove-${suffix}`)
    const firstMember = await createHouseholdUser(`hh-first-${suffix}`)
    const secondMember = await createHouseholdUser(`hh-second-${suffix}`)
    const household = await insertTestHousehold(owner.id)
    const firstMembership = await addMember(household.id, firstMember, null, NEWER)
    await addMember(household.id, secondMember, null, OLDER)
    await loginAndOpenHousehold(page, owner)

    const deleteGate = Promise.withResolvers<void>()
    let deleteCount = 0
    await page.route(
      `**/api/v1/households/${household.id}/memberships/${firstMembership.id}`,
      async route => {
        deleteCount += 1
        await deleteGate.promise
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Injected removal failure' }),
        })
      },
    )

    await page.getByTestId('household-remove').nth(0).click()
    await expect(page.getByTestId('household-remove-confirmation')).toBeVisible()
    await page.getByTestId('household-remove-cancel').click()
    await expect(page.getByTestId('household-member-row')).toHaveCount(2)

    await page.getByTestId('household-remove').nth(0).click()
    const deleteRequest = page.waitForRequest(
      request =>
        new URL(request.url()).pathname ===
        `/api/v1/households/${household.id}/memberships/${firstMembership.id}`,
    )
    await page.getByTestId('household-remove-confirm').evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })
    await deleteRequest
    await expect(page.getByTestId('household-member-row')).toHaveCount(1)
    await expect(page.getByTestId('household-member-name').nth(0)).toHaveText(
      `@${secondMember.username}`,
    )

    deleteGate.resolve()
    await expect(page.getByTestId('household-member-row')).toHaveCount(2)
    await expect(page.getByTestId('household-member-name').nth(0)).toHaveText(
      `@${firstMember.username}`,
    )
    expect(deleteCount).toBe(1)
  })

  test('allows different member removals to remain in flight concurrently', async ({ page }) => {
    const suffix = randomSuffix()
    const owner = await createHouseholdUser(`hh-concurrent-${suffix}`)
    const firstMember = await createHouseholdUser(`hh-a-${suffix}`)
    const secondMember = await createHouseholdUser(`hh-b-${suffix}`)
    const household = await insertTestHousehold(owner.id)
    const firstMembership = await addMember(household.id, firstMember, null, NEWER)
    const secondMembership = await addMember(household.id, secondMember, null, OLDER)
    await loginAndOpenHousehold(page, owner)

    const gates = new Map([
      [firstMembership.id, Promise.withResolvers<void>()],
      [secondMembership.id, Promise.withResolvers<void>()],
    ])
    await page.route(`**/api/v1/households/${household.id}/memberships/*`, async route => {
      const membershipId = new URL(route.request().url()).pathname.split('/').at(-1)!
      await gates.get(membershipId)!.promise
      await route.fulfill({ status: 204 })
    })

    const firstRequest = page.waitForRequest(request => request.url().endsWith(firstMembership.id))
    const firstResponse = page.waitForResponse(response =>
      response.url().endsWith(firstMembership.id),
    )
    await page.getByTestId('household-remove').nth(0).click()
    await page.getByTestId('household-remove-confirm').click()
    await firstRequest

    const secondRequest = page.waitForRequest(request =>
      request.url().endsWith(secondMembership.id),
    )
    const secondResponse = page.waitForResponse(response =>
      response.url().endsWith(secondMembership.id),
    )
    await page.getByTestId('household-remove').click()
    await page.getByTestId('household-remove-confirm').click()
    await secondRequest
    await expect(page.getByTestId('household-member-row')).toHaveCount(0)

    gates.get(firstMembership.id)!.resolve()
    gates.get(secondMembership.id)!.resolve()
    await Promise.all([firstResponse, secondResponse])
    await expect(page.getByTestId('household-members-empty')).toBeVisible()
  })

  test('keeps the empty household action usable within a phone viewport', async ({ page }) => {
    const owner = await createHouseholdUser(`hh-phone-${randomSuffix()}`)
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
    await loginAndOpenHousehold(page, owner)

    await expect(page.getByTestId('household-create')).toBeVisible()
    const createResponse = page.waitForResponse(
      response =>
        new URL(response.url()).pathname === '/api/v1/households' &&
        response.request().method() === 'POST',
    )
    await page.getByTestId('household-create').click()
    const response = await createResponse
    expect(response.request().postDataJSON()).toEqual({})
    await expect(page.getByTestId('household-members-heading').nth(0)).toHaveText('Your household')
    const dimensions = await page.evaluate(() => ({
      contentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }))
    expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
  })
})
