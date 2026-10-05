import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import {
  clearManagerInputWithSelectAll,
  clickFirstManagerControl,
  clickManagerControl,
  assertContainedValue,
  assertFirstManagerControlVisible,
  assertManagerControlVisible,
  assertManagerErrorToast,
  assertManagerHeading,
  assertSeededName,
  useIphoneSeViewport,
} from '../../helpers/authenticated-manager-page.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { createTestUserDirect } from '../../../backend/test-helpers/entities/users-direct.mts'
import {
  insertTestHousehold,
  insertTestHouseholdMembership,
} from '../../../backend/test-helpers/entities/households.mts'
import {
  insertTestHouseholdSpendingEntry,
  insertTestSpendingCategory,
  insertTestSpendingEntry,
} from '../../../backend/test-helpers/entities/spending-categories.mts'

test.describe('My Spending Categories', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/my/spending-categories')
  })

  test('displays page heading', async ({ page }) => {
    await assertManagerHeading(page, 'settings-page-header-title', 'Spending Categories')
  })

  test('displays seeded spending category', async ({ page }) => {
    await assertSeededName(page, 'spending-category-name', 'Groceries')
  })

  test('displays amount and frequency', async ({ page }) => {
    await assertContainedValue(page, 'spending-category-amount', 'Monthly')
  })

  test('add form is always visible without clicking any button', async ({ page }) => {
    await assertManagerControlVisible(page, 'spending-categories-manager')
    await assertManagerControlVisible(page, 'spending-categories-add-form-heading')
    await assertManagerControlVisible(page, 'spending-categories-add-amount-label')
    await assertManagerControlVisible(page, 'spending-categories-add-frequency-label')
  })

  test('shows edit button', async ({ page }) => {
    await assertFirstManagerControlVisible(page, 'spending-category-edit-button')
  })

  test('edit form validates empty amount', async ({ page }) => {
    await clickFirstManagerControl(page, 'spending-category-edit-button')
    await clearManagerInputWithSelectAll(page, 'spending-category-edit-amount-input')
    await clickManagerControl(page, 'spending-category-edit-save-button')
    await assertManagerErrorToast(page, 'Please enter a valid amount')
  })

  test('responsive layout on mobile', async ({ page }) => {
    await useIphoneSeViewport(page)
    await navigateTo(page, '/my/spending-categories')
    await assertManagerHeading(page, 'settings-page-header-title', 'Spending Categories')
    await assertSeededName(page, 'spending-category-name', 'Groceries')
  })
})

test.describe('My Spending Categories pagination', () => {
  test('continues the cursor-paginated list with a stable continuation control', async ({
    page,
  }) => {
    const user = requireTestValue(
      await createTestUserDirect({ username: `pw-spending-${randomSuffix()}` }),
      'Expected a test individual',
    )
    const individualId = requireTestValue(user.individual_id, 'Expected a test individual')
    const categoryId = await insertTestSpendingCategory({ createdById: user.id })
    await Promise.all(
      Array.from({ length: 26 }, () =>
        insertTestSpendingEntry({
          individualId,
          spendingCategoryId: categoryId,
        }),
      ),
    )
    const cursors: string[] = []
    await page.route('**/api/v1/my/spending-categories?**', async route => {
      const after = new URL(route.request().url()).searchParams.get('after')
      if (after) cursors.push(after)
      await route.continue()
    })

    await loginAsUser(page, user.id)
    await navigateTo(page, '/my/spending-categories')
    await expect(page.getByTestId('spending-category-name')).toHaveCount(25)
    await page.getByTestId('paginated-list-continuation').getByRole('button').click()
    await expect(page.getByTestId('spending-category-name')).toHaveCount(26)
    expect(cursors).toHaveLength(1)
  })
})

test.describe('My Spending Categories household access', () => {
  test('renders shared household entries read-only for members', async ({ page }) => {
    const suffix = randomSuffix()
    const owner = requireTestValue(
      await createTestUserDirect({ username: `pw-spending-owner-${suffix}` }),
      'Expected household spending test users to have individuals',
    )
    const member = requireTestValue(
      await createTestUserDirect({ username: `pw-spending-member-${suffix}` }),
      'Expected household spending test users to have individuals',
    )
    requireTestValue(
      owner.individual_id,
      'Expected household spending test users to have individuals',
    )
    const memberIndividualId = requireTestValue(
      member.individual_id,
      'Expected household spending test users to have individuals',
    )
    const household = await insertTestHousehold(owner.id)
    await insertTestHouseholdMembership({
      householdId: household.id,
      individualId: memberIndividualId,
    })
    const categoryId = await insertTestSpendingCategory({
      createdById: owner.id,
      name: `Shared spending ${suffix}`,
    })
    await insertTestHouseholdSpendingEntry({
      householdId: household.id,
      spendingCategoryId: categoryId,
    })

    await loginAsUser(page, member.id)
    await navigateTo(page, '/my/spending-categories')

    await expect(page.getByTestId('spending-category-read-only')).toBeVisible()
    await expect(page.getByTestId('spending-category-edit-button')).toHaveCount(0)
    await expect(page.getByTestId('spending-category-remove-button')).toHaveCount(0)
  })
})
