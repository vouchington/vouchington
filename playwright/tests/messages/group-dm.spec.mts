import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  createTestGroupConversation,
} from '../../../backend/test-helpers/index.mts'

let ownerUserId = ''
let memberUserId = ''
let viewConvId = ''
let addParticipantConvId = ''
let removeConvId = ''
let leaveConvId = ''
let policyConvId = ''
let memberViewConvId = ''
let inviteeSuffix = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  inviteeSuffix = suffix

  const owner = await createTestUser({ username: `gdm-owner-${suffix}` })
  if (!owner) throw new Error('Failed to create owner user')
  ownerUserId = owner.id

  const member = await createTestUser({ username: `gdm-member-${suffix}` })
  if (!member) throw new Error('Failed to create member user')
  memberUserId = member.id

  const invitee = await createTestUser({ username: `gdm-invitee-${suffix}` })
  if (!invitee) throw new Error('Failed to create invitee user')

  // Separate conversations per mutating test so tests are independent
  ;[viewConvId, addParticipantConvId, removeConvId, leaveConvId, policyConvId, memberViewConvId] =
    await Promise.all(
      Array.from({ length: 6 }, () =>
        createTestGroupConversation({
          createdById: ownerUserId,
          memberUserIds: [memberUserId],
        }).then(c => c.id),
      ),
    )
})

test.describe('New message compose page', () => {
  test('shows new message button on inbox', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, '/messages')

    await expect(page.getByTestId('new-message-button')).toBeVisible()
  })

  test('compose: pick recipient and send message', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, '/messages/new')

    await expect(page.getByTestId('new-message-form')).toBeVisible()
    await expect(page.getByTestId('recipient-picker')).toBeVisible()

    // Search member by unique suffix; since suffix is in username, only test users appear
    await page
      .getByTestId('recipient-picker-input')
      .pressSequentially(`gdm-member-${inviteeSuffix}`)
    await expect(page.getByTestId('recipient-picker-item').first()).toBeVisible()
    await page.getByTestId('recipient-picker-item').first().click()

    // Chip appears
    await expect(page.getByTestId('recipient-chip').first()).toBeVisible()
    await expect(page.getByTestId('remove-recipient-button').first()).toBeVisible()

    // Remove chip then re-add
    await page.getByTestId('remove-recipient-button').first().click()
    await expect(page.getByTestId('recipient-chip')).toBeHidden()

    await page
      .getByTestId('recipient-picker-input')
      .pressSequentially(`gdm-member-${inviteeSuffix}`)
    await expect(page.getByTestId('recipient-picker-item').first()).toBeVisible()
    await page.getByTestId('recipient-picker-item').first().click()

    await page.getByTestId('new-message-body-input').fill('Hello group!')
    await expect(page.getByTestId('new-message-submit-button')).toBeEnabled()
    await page.getByTestId('new-message-submit-button').click()

    await expect(page).toHaveURL(/\/messages\/[a-z0-9-]+$/)
  })
})

test.describe('Group DM thread — owner view', () => {
  test('shows group thread header and participants panel with items', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/messages/${viewConvId}`)

    await expect(page.getByTestId('group-thread-header')).toBeVisible()
    await expect(page.getByTestId('participants-panel')).toBeVisible()
    await expect(page.getByTestId('participant-item')).toHaveCount(2)
  })

  test('owner sees add button and policy toggles', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/messages/${viewConvId}`)

    await expect(page.getByTestId('add-participant-button')).toBeVisible()
    await expect(page.getByTestId('policy-owner-only')).toBeVisible()
    await expect(page.getByTestId('policy-all-members')).toBeVisible()
  })

  test('add participant via autocomplete', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/messages/${addParticipantConvId}`)

    await page.getByTestId('add-participant-button').click()
    await page
      .getByTestId('add-participant-input')
      .pressSequentially(`gdm-invitee-${inviteeSuffix}`)
    await expect(page.getByTestId('add-participant-item').first()).toBeVisible()
    await page.getByTestId('add-participant-item').first().click()

    await expect(page.getByTestId('participant-item')).toHaveCount(3)
  })

  test('remove participant with confirm step', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/messages/${removeConvId}`)

    await expect(page.getByTestId('participant-item')).toHaveCount(2)
    await page.getByTestId('remove-participant-button').first().click()
    await expect(page.getByTestId('confirm-remove-participant')).toBeVisible()
    await page.getByTestId('confirm-remove-participant').click()

    await expect(page.getByTestId('participant-item')).toHaveCount(1)
  })

  test('policy toggle switches active state', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/messages/${policyConvId}`)

    await expect(page.getByTestId('policy-owner-only')).toBeVisible()
    await expect(page.getByTestId('policy-all-members')).toBeVisible()

    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/api/v1/my/messages/') && resp.request().method() === 'PATCH',
    )
    await page.getByTestId('policy-all-members').click()
    const response = await responsePromise
    expect(response.status()).toBe(200)
  })
})

test.describe('Group DM thread — member view', () => {
  test('shows leave button; no add button with default owner-only policy', async ({ page }) => {
    await loginAsUser(page, memberUserId)
    await navigateTo(page, `/messages/${memberViewConvId}`)

    await expect(page.getByTestId('leave-conversation-button')).toBeVisible()
    await expect(page.getByTestId('add-participant-button')).toBeHidden()
  })

  test('member can leave conversation', async ({ page }) => {
    await loginAsUser(page, memberUserId)
    await navigateTo(page, `/messages/${leaveConvId}`)

    const responsePromise = page.waitForResponse(
      resp =>
        resp.url().includes(`/api/v1/my/messages/${leaveConvId}/participants/`) &&
        resp.request().method() === 'DELETE',
    )
    await page.getByTestId('leave-conversation-button').click()
    const response = await responsePromise
    expect(response.status()).toBe(204)

    await expect(page).toHaveURL('/messages')

    // The member must actually be removed from the conversation, not just
    // navigated away — confirm the owner now sees one fewer participant.
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/messages/${leaveConvId}`)
    await expect(page.getByTestId('participant-item')).toHaveCount(1)
  })
})
