import { expect, type Page } from './test.mts'
import { randomSuffix } from 'vouchington-tooling/playwright'
import {
  generateTestTotpCode,
  insertTestTotpAuthenticator,
} from '../../backend/test-helpers/entities/totp.mts'

/** Each confirmation gets its own fixture factor; never replay a consumed TOTP step. */
export async function confirmAccountChange(page: Page, userId: string): Promise<void> {
  const dialog = page.getByTestId('mfa-reauth-dialog')
  await expect(dialog).toBeVisible()
  await insertTestTotpAuthenticator(userId, randomSuffix())
  await dialog.getByRole('button', { name: /Authenticator app/i }).click()
  await dialog.locator('input[inputmode="numeric"]').pressSequentially(generateTestTotpCode())
  await expect(dialog).toBeHidden()
}
