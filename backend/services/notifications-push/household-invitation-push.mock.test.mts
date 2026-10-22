import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import webpush, { type SendResult } from 'web-push'
import {
  createTestUserDirect,
  deleteOwnedHouseholdsForTestUser,
  getTestNotificationPushIntent,
  insertTestHousehold,
  insertTestHouseholdInvitation,
  listHouseholdInvitationNotificationIdsForTest,
  setTestHouseholdInvitationTerminalState,
} from '@voucha/test-helpers'
import { createHouseholdInvitationNotifications } from '@services/notifications/create-household-invitation-notification'
import { upsertWebPushSubscription } from '@services/notifications/push-subscriptions'
import { deliverClaimedNotificationPushIntent } from './push-intent-delivery.mts'
import { claimNotificationPushIntent } from './push-intents.mts'

vi.mock<typeof import('web-push')>(import('web-push'), async importActual => {
  const actual = await importActual()
  const mocked = {
    ...actual,
    sendNotification: vi.fn<typeof actual.sendNotification>(),
    setVapidDetails: vi.fn<typeof actual.setVapidDetails>(),
  }
  return { ...mocked, default: mocked }
})

describe('household invitation push delivery', () => {
  beforeEach(() => {
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'test-public-key')
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', 'test-private-key')
    vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:tests+household-invitations@voucha.ai')
    vi.mocked(webpush.sendNotification).mockReset()
    vi.mocked(webpush.sendNotification).mockResolvedValue(successfulSendResult())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sends a still-pending invitation', async () => {
    const fixture = await createFixture()
    const intent = await claimNotificationPushIntent(
      { user_id: fixture.invitee.id, notification_id: fixture.notificationId },
      120,
    )

    await expect(deliverClaimedNotificationPushIntent(intent!)).resolves.toEqual({
      delivered: 1,
      suppressed: false,
    })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
    await expect(
      getTestNotificationPushIntent(fixture.invitee.id, fixture.notificationId),
    ).resolves.toMatchObject({ status: 'delivered' })
  })

  it.each(['revoked', 'accepted', 'declined'] as const)(
    'skips an invitation that was %s before the push job runs',
    async state => {
      const fixture = await createFixture()
      const intent = await claimNotificationPushIntent(
        { user_id: fixture.invitee.id, notification_id: fixture.notificationId },
        120,
      )
      await expect(
        setTestHouseholdInvitationTerminalState(fixture.invitationId, state),
      ).resolves.toBe(1)

      await expect(deliverClaimedNotificationPushIntent(intent!)).resolves.toEqual({
        delivered: 0,
        suppressed: true,
      })
      expect(webpush.sendNotification).not.toHaveBeenCalled()
      await expect(
        getTestNotificationPushIntent(fixture.invitee.id, fixture.notificationId),
      ).resolves.toMatchObject({ status: 'suppressed' })
    },
  )

  it('skips a deleted household after its invitation and notification cascade away', async () => {
    const fixture = await createFixture()
    const intent = await claimNotificationPushIntent(
      { user_id: fixture.invitee.id, notification_id: fixture.notificationId },
      120,
    )
    expect(await deleteOwnedHouseholdsForTestUser(fixture.owner.id)).toBe(1)

    await expect(deliverClaimedNotificationPushIntent(intent!)).resolves.toEqual({
      delivered: 0,
      suppressed: true,
    })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
    await expect(
      listHouseholdInvitationNotificationIdsForTest(fixture.invitee.id, fixture.invitationId),
    ).resolves.toEqual([])
  })
})

async function createFixture() {
  const owner = await createTestUserDirect()
  const invitee = await createTestUserDirect()
  const household = await insertTestHousehold(owner.id)
  const invitationId = await insertTestHouseholdInvitation({
    householdId: household.id,
    invitedUserId: invitee.id,
    invitedById: owner.id,
  })
  const created = await createHouseholdInvitationNotifications(
    [{ userId: invitee.id, householdId: household.id, invitationId }],
    {},
  )
  expect(created).toHaveLength(1)
  const ids = await listHouseholdInvitationNotificationIdsForTest(invitee.id, invitationId)
  expect(ids).toHaveLength(1)
  await upsertWebPushSubscription({
    userId: invitee.id,
    endpoint: `https://push.example.com/household-invitation-${crypto.randomUUID()}`,
    p256dh: 'household-invitation-p256dh',
    auth: 'household-invitation-auth',
    expirationTimeMs: null,
    userAgent: 'vitest',
  })
  return {
    owner,
    invitee,
    invitationId,
    notificationId: ids[0]!,
  }
}

function successfulSendResult(): SendResult {
  return { statusCode: 201, body: '', headers: {} }
}
