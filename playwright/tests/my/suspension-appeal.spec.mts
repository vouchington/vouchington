import { expect, test } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { createTestUser, suspendTestUserGetId } from '../../../backend/test-helpers/index.mts'

let suspendedUserId = ''
let suffix = ''

test.beforeAll(async () => {
  suffix = randomSuffix()
  const suspendedUser = requireTestValue(
    await createTestUser({ username: `suspension-appeal-user-${suffix}` }),
    'Failed to create suspended user',
  )
  suspendedUserId = suspendedUser.id
  await suspendTestUserGetId(suspendedUserId, 'Test suspension for appeal spec')
})

test.describe('/my/account-status — suspension appeal', () => {
  test('shows "File an appeal" button on account-status page when suspended', async ({ page }) => {
    await loginAsUser(page, suspendedUserId)
    await navigateTo(page, '/my/account-status')

    await expect(page.getByTestId('my-account-status-page')).toBeVisible()
    await expect(page.getByTestId('appeal-dialog-trigger')).toBeVisible()
  })

  test('opens the appeal dialog when "File an appeal" is clicked', async ({ page }) => {
    await loginAsUser(page, suspendedUserId)
    await navigateTo(page, '/my/account-status')

    await page.getByTestId('appeal-dialog-trigger').click()
    await expect(page.getByTestId('appeal-form')).toBeVisible()
    await expect(page.getByTestId('turnstile-container')).toBeVisible()
  })

  test('can file a suspension appeal from account-status page', async ({ page }) => {
    const appealSuffix = randomSuffix()
    const appealUser = await createTestUser({
      username: `suspension-appeal-filer-${appealSuffix}`,
    })
    const filer = requireTestValue(appealUser, 'Failed to create appeal user')
    await suspendTestUserGetId(filer.id, 'Suspension for filing test')

    await loginAsUser(page, filer.id)
    await navigateTo(page, '/my/account-status')

    await page.getByTestId('appeal-dialog-trigger').click()
    await expect(page.getByTestId('appeal-form')).toBeVisible()

    await page.getByRole('combobox').click()
    await page.getByRole('listbox').getByTestId('appeal-reason-option-incorrect_facts').click()
    await expect(page.getByRole('listbox')).toBeHidden()

    const appealStatement = page.getByRole('textbox', { name: 'Statement' })
    await appealStatement.click()
    await appealStatement.pressSequentially('My account was suspended in error.')

    await expect(page.getByTestId('appeal-submit-button')).toBeEnabled()
    await appealStatement.press('ControlOrMeta+Enter')

    await expect(page.getByTestId('appeal-form')).toBeHidden()
  })

  test('filed suspension appeal appears in /my/appeals', async ({ page }) => {
    const trackSuffix = randomSuffix()
    const trackUser = await createTestUser({
      username: `suspension-appeal-track-${trackSuffix}`,
    })
    const tracker = requireTestValue(trackUser, 'Failed to create track user')
    await suspendTestUserGetId(tracker.id, 'Suspension for tracking test')

    await loginAsUser(page, tracker.id)
    await navigateTo(page, '/my/account-status')

    await page.getByTestId('appeal-dialog-trigger').click()
    await expect(page.getByTestId('appeal-form')).toBeVisible()

    await page.getByRole('combobox').click()
    await page.getByRole('listbox').getByTestId('appeal-reason-option-context_missing').click()
    await expect(page.getByRole('listbox')).toBeHidden()

    const appealStatement = page.getByRole('textbox', { name: 'Statement' })
    await appealStatement.click()
    await appealStatement.pressSequentially('Context was missing from the suspension decision.')

    await expect(page.getByTestId('appeal-submit-button')).toBeEnabled()
    await appealStatement.press('ControlOrMeta+Enter')

    await expect(page.getByTestId('appeal-form')).toBeHidden()

    await navigateTo(page, '/my/appeals')
    await expect(page.getByTestId('appeals-list')).toBeVisible()
    await expect(page.getByTestId('member-appeal-row').first()).toBeVisible()
    await expect(page.getByTestId('member-appeal-row').first()).toContainText('Platform suspension')
  })
})
