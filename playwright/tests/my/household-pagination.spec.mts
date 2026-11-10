import { createTestUserDirect } from '../../../backend/test-helpers/entities/users-direct.mts'
import { createTestUsersDirect } from '../../../backend/test-helpers/entities/users-direct-batches.mts'
import {
  deleteOwnedHouseholdsForTestUser,
  insertTestHousehold,
} from '../../../backend/test-helpers/entities/households.mts'
import {
  insertTestHouseholdMembers,
  insertTestHouseholdMemberships,
} from '../../../backend/test-helpers/entities/household-bulk-fixtures.mts'
import type { PrivateUser } from '../../../backend/services/users/types.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { test, expect, type Page } from '../../helpers/test.mts'

const MEMBER_CAP = 25
const INDIVIDUAL_CAP = 5

async function createHouseholdUser(username: string): Promise<PrivateUser> {
  const user = await createTestUserDirect({ username })
  if (!user?.individual_id) throw new Error('Expected household test user to have an individual')
  await deleteOwnedHouseholdsForTestUser(user.id)
  return user
}

async function loginAndOpenHousehold(page: Page, user: PrivateUser) {
  await loginAsUser(page, user.id)
  await navigateTo(page, '/my/household')
  await expect(page.getByTestId('household-manager')).toBeVisible()
}

test.describe('My Household pagination', () => {
  test('shows every shared household on one page', async ({ page }) => {
    const suffix = randomSuffix()
    const viewer = await createHouseholdUser(`hh-shared-pages-${suffix}`)
    const owners = await createTestUsersDirect(INDIVIDUAL_CAP)
    const households = await Promise.all(owners.map(owner => insertTestHousehold(owner.id)))
    await insertTestHouseholdMemberships({
      householdIds: households.map(household => household.id),
      individualId: viewer.individual_id!,
    })

    await loginAndOpenHousehold(page, viewer)
    await expect(page.getByTestId('household-section')).toHaveCount(INDIVIDUAL_CAP)
    await expect(page.getByTestId('household-member-row')).toHaveCount(INDIVIDUAL_CAP)
    await expect(page.getByTestId('household-members-retry')).toHaveCount(0)
    await expect(page.getByTestId('paginated-list-continuation')).toHaveCount(0)
  })

  test('shows a full household on one page', async ({ page }) => {
    const suffix = randomSuffix()
    const owner = await createHouseholdUser(`hh-member-pages-${suffix}`)
    const household = await insertTestHousehold(owner.id)
    const members = await createTestUsersDirect(MEMBER_CAP)
    await insertTestHouseholdMembers({
      householdId: household.id,
      individualIds: members.map(member => member.individual_id!),
    })

    await loginAndOpenHousehold(page, owner)
    await expect(page.getByTestId('household-member-row')).toHaveCount(MEMBER_CAP)
    await expect(page.getByTestId('paginated-list-continuation')).toHaveCount(0)
  })
})
