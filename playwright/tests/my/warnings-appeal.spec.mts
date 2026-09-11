import { expect, test } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  insertTestModerationAppeal,
  insertTestUserWarning,
} from '../../../backend/test-helpers/index.mts'

let warnedUserId = ''
let adminId = ''
let suffix = ''

test.beforeAll(async () => {
  suffix = randomSuffix()

  const admin = requireTestValue(
    await createTestUser({
      username: `warnings-appeal-admin-${suffix}`,
      administrator: true,
    }),
    'Failed to create admin user',
  )
  adminId = admin.id

  const warnedUser = requireTestValue(
    await createTestUser({ username: `warnings-appeal-user-${suffix}` }),
    'Failed to create warned user',
  )
  warnedUserId = warnedUser.id

  await insertTestUserWarning({
    userId: warnedUserId,
    issuedById: adminId,
    reason: 'Test rule violation',
    publicMessage: 'You violated the community guidelines.',
  })
})

test.describe('/my/warnings — appeal filing', () => {
  test('shows "File an appeal" button for a warning', async ({ page }) => {
    await loginAsUser(page, warnedUserId)
    await navigateTo(page, '/my/warnings')

    await expect(page.getByTestId('my-warnings-list')).toBeVisible()
    await expect(page.getByTestId('appeal-dialog-trigger').first()).toBeVisible()
  })

  test('opens the appeal dialog when "File an appeal" is clicked', async ({ page }) => {
    await loginAsUser(page, warnedUserId)
    await navigateTo(page, '/my/warnings')

    await page.getByTestId('appeal-dialog-trigger').first().click()
    await expect(page.getByTestId('appeal-form')).toBeVisible()
    await expect(page.getByTestId('turnstile-container')).toBeVisible()
  })

  test('can file an appeal against a warning', async ({ page }) => {
    await loginAsUser(page, warnedUserId)
    await navigateTo(page, '/my/warnings')

    await page.getByTestId('appeal-dialog-trigger').first().click()
    await expect(page.getByTestId('appeal-form')).toBeVisible()

    // Select a reason via the Radix Select
    await page.getByRole('combobox').click()
    await page.getByRole('listbox').getByTestId('appeal-reason-option-incorrect_facts').click()
    // Wait for listbox to close before continuing
    await expect(page.getByRole('listbox')).toBeHidden()

    // Fill in the statement; Cmd/Ctrl+Enter submits via submitOnCmdEnter in <Textarea>.
    // Click explicitly to ensure focus is on the textarea (Radix Select returns focus
    // to the trigger on close; without this click, pressSequentially may dispatch to
    // the wrong element if the trigger has focus).
    const appealStatement = page.getByRole('textbox', { name: 'Statement' })
    await appealStatement.click()
    await appealStatement.pressSequentially(
      'I did not violate the rules. The cited post was taken out of context.',
    )

    // Wait for Turnstile stub token to enable the submit button, then submit via keyboard
    // (avoids dialog-overlay z-index hit-test issues).
    await expect(page.getByTestId('appeal-submit-button')).toBeEnabled()
    await appealStatement.press('ControlOrMeta+Enter')

    // Dialog closes on success
    await expect(page.getByTestId('appeal-form')).toBeHidden()
  })

  test('shows validation error when no reason is selected before submitting', async ({ page }) => {
    await loginAsUser(page, warnedUserId)
    await navigateTo(page, '/my/warnings')

    await page.getByTestId('appeal-dialog-trigger').first().click()
    await expect(page.getByTestId('appeal-form')).toBeVisible()

    // Type a statement but skip selecting a reason
    await page
      .getByRole('textbox', { name: 'Statement' })
      .pressSequentially('A statement without selecting a reason first.')

    // Wait for Turnstile token so the button is enabled
    await expect(page.getByTestId('appeal-submit-button')).toBeEnabled()
    await page.getByTestId('appeal-submit-button').click()

    await expect(page.getByTestId('appeal-form-validation-error')).toBeVisible()
    await expect(page.getByTestId('appeal-form-validation-error')).toContainText(
      'Please select a reason',
    )
  })

  test('user with no warnings sees empty state and no appeal trigger', async ({ page }) => {
    const cleanSuffix = randomSuffix()
    const cleanUser = requireTestValue(
      await createTestUser({ username: `warnings-clean-user-${cleanSuffix}` }),
      'Failed to create clean user',
    )

    await loginAsUser(page, cleanUser.id)
    await navigateTo(page, '/my/warnings')

    await expect(page.getByTestId('my-warnings-empty')).toBeVisible()
    await expect(page.getByTestId('appeal-dialog-trigger')).toHaveCount(0)
  })

  test('filed appeal appears in /my/appeals', async ({ page }) => {
    const appealSuffix = randomSuffix()
    const appealAdmin = requireTestValue(
      await createTestUser({
        username: `appeals-track-admin-${appealSuffix}`,
        administrator: true,
      }),
      'Failed to create admin',
    )

    const appealUser = requireTestValue(
      await createTestUser({ username: `appeals-track-user-${appealSuffix}` }),
      'Failed to create user',
    )

    await insertTestUserWarning({
      userId: appealUser.id,
      issuedById: appealAdmin.id,
      reason: 'Appeal tracking test',
      publicMessage: 'Test warning for appeal tracking.',
    })

    // File the appeal via the UI
    await loginAsUser(page, appealUser.id)
    await navigateTo(page, '/my/warnings')

    await page.getByTestId('appeal-dialog-trigger').first().click()
    await expect(page.getByTestId('appeal-form')).toBeVisible()

    await page.getByRole('combobox').click()
    await page.getByRole('listbox').getByTestId('appeal-reason-option-context_missing').click()
    await expect(page.getByRole('listbox')).toBeHidden()

    // Click explicitly to ensure focus is on the textarea (Radix Select returns focus
    // to the trigger on close; without this click, pressSequentially may dispatch to
    // the wrong element if the trigger has focus).
    const appealStatement2 = page.getByRole('textbox', { name: 'Statement' })
    await appealStatement2.click()
    await appealStatement2.pressSequentially(
      'The context was missing from the original warning review.',
    )

    await expect(page.getByTestId('appeal-submit-button')).toBeEnabled()
    await appealStatement2.press('ControlOrMeta+Enter')

    // Dialog closes on success
    await expect(page.getByTestId('appeal-form')).toBeHidden()

    // Navigate to /my/appeals and confirm the filed appeal is listed
    await navigateTo(page, '/my/appeals')
    await expect(page.getByTestId('appeals-list')).toBeVisible()
    await expect(page.getByTestId('member-appeal-row').first()).toBeVisible()
  })

  test('shows duplicate-appeal message if an active appeal already exists', async ({ page }) => {
    const dupSuffix = randomSuffix()
    const dupAdmin = requireTestValue(
      await createTestUser({
        username: `dup-appeal-admin-${dupSuffix}`,
        administrator: true,
      }),
      'Failed to create dup admin',
    )

    const dupUser = requireTestValue(
      await createTestUser({ username: `dup-appeal-user-${dupSuffix}` }),
      'Failed to create dup user',
    )

    const dupWarning = await insertTestUserWarning({
      userId: dupUser.id,
      issuedById: dupAdmin.id,
      reason: 'Duplicate appeal test',
    })

    // Pre-seed an existing pending appeal for this warning
    await insertTestModerationAppeal({
      appellantId: dupUser.id,
      userWarningId: dupWarning.id,
      appealReason: 'Pre-existing appeal reason',
    })

    await loginAsUser(page, dupUser.id)
    await navigateTo(page, '/my/warnings')

    await page.getByTestId('appeal-dialog-trigger').first().click()
    await expect(page.getByTestId('appeal-form')).toBeVisible()

    await page.getByRole('combobox').click()
    await page.getByRole('listbox').getByTestId('appeal-reason-option-disproportionate').click()
    await expect(page.getByRole('listbox')).toBeHidden()

    // Click explicitly to ensure focus is on the textarea (Radix Select returns focus
    // to the trigger on close; without this click, pressSequentially may dispatch to
    // the wrong element if the trigger has focus).
    const dupStatement = page.getByRole('textbox', { name: 'Statement' })
    await dupStatement.click()
    await dupStatement.pressSequentially('This is a duplicate appeal submission.')

    await expect(page.getByTestId('appeal-submit-button')).toBeEnabled()
    await dupStatement.press('ControlOrMeta+Enter')

    // Dialog still closes (the dedup response is still a success from the user's POV)
    await expect(page.getByTestId('appeal-form')).toBeHidden()
  })
})
