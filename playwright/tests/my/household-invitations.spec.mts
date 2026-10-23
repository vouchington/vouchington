import { createTestUserDirect } from '../../../backend/test-helpers/entities/users-direct.mts'
import { insertTestHousehold } from '../../../backend/test-helpers/entities/households.mts'
import { navigateTo, randomSuffix, requireTestValue } from 'vouchington-tooling/playwright'
import { loginAsUser } from '../../helpers/auth.mts'
import { test, expect } from '../../helpers/test.mts'

let fixture: {
  ownerId: string
  ownerUsername: string
  inviteeId: string
  inviteeUsername: string
  householdId: string
  relationship: string
}

test.beforeEach(async () => {
  const suffix = randomSuffix()
  const owner = requireTestValue(
    await createTestUserDirect({ username: `hh-invite-owner-${suffix}` }),
    'Expected household owner',
  )
  const inviteeUsername = `hh-invitee-${suffix}`
  const invitee = requireTestValue(
    await createTestUserDirect({ username: inviteeUsername }),
    'Expected household invitee',
  )
  const household = await insertTestHousehold(owner.id)
  fixture = {
    ownerId: owner.id,
    ownerUsername: owner.username!,
    inviteeId: invitee.id,
    inviteeUsername,
    householdId: household.id,
    relationship: '😀'.repeat(64),
  }
})

test('owner invites an existing user and revokes the pending invitation', async ({ page }) => {
  const { ownerId, ownerUsername, inviteeId, inviteeUsername, householdId, relationship } = fixture
  await loginAsUser(page, ownerId)
  await navigateTo(page, '/my/household')
  await expect(page.getByTestId('household-manager')).toBeVisible()

  const sent = page
    .getByTestId('household-invitations')
    .filter({ has: page.getByTestId('household-invitation-form') })
  const form = sent.getByTestId('household-invitation-form')
  await expect(form).toBeVisible()
  const username = form.getByTestId('household-invitation-user')
  await expect(username).toBeEnabled()
  await expect(username).toHaveValue('')
  await username.pressSequentially(inviteeUsername)
  await page.getByRole('listbox').getByRole('option').filter({ hasText: inviteeUsername }).click()
  await form.getByTestId('household-invitation-relationship').fill(relationship)
  await expect(form.getByTestId('household-invitation-relationship')).toHaveValue(relationship)

  const createResponse = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === `/api/v1/households/${householdId}/invitations` &&
      response.request().method() === 'POST',
  )
  await form.getByRole('button').click()
  expect((await createResponse).status()).toBe(201)
  const row = sent.getByTestId('household-invitation-row')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(`@${inviteeUsername}`)
  await expect(row).toContainText(relationship)
  await expect(page.locator('body')).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-/)

  await loginAsUser(page, inviteeId)
  await navigateTo(page, '/my/household')
  const received = page
    .getByTestId('household-invitations')
    .filter({ hasNot: page.getByTestId('household-invitation-form') })
  await expect(received.getByTestId('household-invitation-row')).toContainText(
    `Invited by @${ownerUsername}`,
  )
  await expect(page.locator('body')).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-/)

  await loginAsUser(page, ownerId)
  await navigateTo(page, '/my/household')
  const ownerRow = page
    .getByTestId('household-invitations')
    .filter({ has: page.getByTestId('household-invitation-form') })
    .getByTestId('household-invitation-row')
  await expect(ownerRow).toHaveCount(1)

  const revokeResponse = page.waitForResponse(
    response =>
      new URL(response.url()).pathname.startsWith(
        `/api/v1/households/${householdId}/invitations/`,
      ) && response.request().method() === 'DELETE',
  )
  await ownerRow.getByRole('button').click()
  expect((await revokeResponse).status()).toBe(204)
  await expect(ownerRow).toHaveCount(0)
  await expect(sent).toContainText('No pending invitations.')
})
