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
import { scrollToLoadMore } from '../../helpers/scroll-to-load-more.mts'
import { test, expect, type Page } from '../../helpers/test.mts'

async function createHouseholdUser(username: string): Promise<PrivateUser> {
  const user = await createTestUserDirect({ username })
  if (!user?.individual_id) throw new Error('Expected household test user to have an individual')
  await deleteOwnedHouseholdsForTestUser(user.id)
  return user
}

async function addMember(householdId: string, user: PrivateUser) {
  return insertTestHouseholdMembership({
    householdId,
    individualId: user.individual_id!,
    updatedAt: new Date('2026-07-02T00:00:00Z'),
  })
}

async function loginAndOpenHousehold(page: Page, user: PrivateUser) {
  await loginAsUser(page, user.id)
  await navigateTo(page, '/my/household')
  await expect(page.getByTestId('household-manager')).toBeVisible()
}

test.describe('My Household pagination', () => {
  test('preserves shared households and retries list and membership failures', async ({ page }) => {
    const suffix = randomSuffix()
    const viewer = await createHouseholdUser(`hh-shared-pages-${suffix}`)
    const sharedOwner = await createHouseholdUser(`hh-shared-owner-${suffix}`)
    const households = await Promise.all(
      Array.from({ length: 26 }, () => insertTestHousehold(sharedOwner.id)),
    )
    await Promise.all(households.map(household => addMember(household.id, viewer)))
    let membershipRequestCount = 0
    await page.route('**/api/v1/households/*/memberships?**', async route => {
      membershipRequestCount += 1
      if (membershipRequestCount === 1) {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ message: 'Injected failure' }),
        })
        return
      }
      await route.continue()
    })
    const continuationCursors: string[] = []
    await page.route('**/api/v1/households?**', async route => {
      const url = new URL(route.request().url())
      const cursor = url.searchParams.get('after')
      if (url.searchParams.get('access') !== 'member' || cursor === null) {
        await route.continue()
        return
      }
      continuationCursors.push(cursor)
      if (continuationCursors.length === 1) {
        await route.fulfill({ status: 500, body: JSON.stringify({ message: 'Injected failure' }) })
        return
      }
      await route.continue()
    })
    await loginAndOpenHousehold(page, viewer)
    await expect(page.getByTestId('household-section')).toHaveCount(25)

    const continuation = page.getByTestId('paginated-list-continuation').last()
    await continuation.getByRole('button').click()
    await expect(page.getByTestId('paginated-list-retry')).toBeVisible()
    await expect(page.getByTestId('household-section')).toHaveCount(25)
    await continuation.getByRole('button').click()

    await expect(page.getByTestId('household-section')).toHaveCount(26)
    await expect(page.getByTestId('household-members-retry')).toBeVisible()
    await expect(page.getByTestId('household-member-row')).toHaveCount(25)
    await page.getByTestId('household-members-retry').click()
    await expect(page.getByTestId('household-member-row')).toHaveCount(26)
    expect(continuationCursors).toHaveLength(2)
    expect(continuationCursors[0]).toBe(continuationCursors[1])
    expect(membershipRequestCount).toBe(2)
  })

  test('automatically continues an independent membership section', async ({ page }) => {
    const suffix = randomSuffix()
    const owner = await createHouseholdUser(`hh-member-pages-${suffix}`)
    const household = await insertTestHousehold(owner.id)
    const members = await Promise.all(
      Array.from({ length: 26 }, (_, index) =>
        createHouseholdUser(`hh-page-member-${index}-${suffix}`),
      ),
    )
    await Promise.all(members.map(member => addMember(household.id, member)))
    let continuationCount = 0
    await page.route(`**/api/v1/households/${household.id}/memberships?**`, async route => {
      if (new URL(route.request().url()).searchParams.has('after')) continuationCount += 1
      await route.continue()
    })
    await loginAndOpenHousehold(page, owner)
    await expect(page.getByTestId('household-member-row')).toHaveCount(25)

    await scrollToLoadMore(page)

    await expect(page.getByTestId('household-member-row')).toHaveCount(26)
    expect(continuationCount).toBe(1)
  })
})
