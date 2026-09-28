import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, insertTestImage } from '@voucha/test-helpers'
import {
  confirmCopyrightStaffAlertReview,
  insertCopyrightStaffAlertCase,
  insertCopyrightStaffAlertDelivery,
  insertMissedCopyrightDeadline,
  markCopyrightStaffAlertDelivery,
  readCopyrightDeadlineObligation,
  readCopyrightDeliveryObligation,
} from '@voucha/test-helpers/data-stores/psql/copyright-staff-alerts'
import {
  eraseCopyrightStaffActor,
  insertErasableCopyrightStaffActor,
  readCopyrightStaffAlertPolicy,
} from '@voucha/test-helpers/data-stores/psql/copyright-staff-alert-actors'
import {
  acknowledgeCopyrightStaffAlert,
  listCopyrightStaffAlertAcknowledgements,
  listOpenCopyrightStaffAlerts,
  replayFailedCopyrightDeliveryIntent,
  syncCopyrightStaffAlerts,
  syncCopyrightStaffAlertsFromRecovery,
} from './index.mts'
import {
  copyrightStaffAlertModerator as moderator,
  syncTrailingCopyrightStaffAlertPage,
  withApprovedCopyrightStaffAlertPolicy as withApprovedPolicy,
} from './staff-alerts-fixtures.mts'
describe('copyright staff alerts', () => {
  let actor: Awaited<ReturnType<typeof createTestUser>>
  let imageId: string

  beforeAll(async () => {
    actor = await createTestUser()
    imageId = await insertTestImage(actor.id)
  })

  it('stays closed without an approved policy and after that policy is revoked', async () => {
    const staff = moderator(actor)
    const created = await insertCopyrightStaffAlertCase({
      imageId,
      actorUserId: actor.id,
      provisional: false,
    })
    const intentId = await insertCopyrightStaffAlertDelivery(created.noticeId, actor.id)
    await markCopyrightStaffAlertDelivery({
      intentId,
      kind: 'failed',
      failureCiphertext: created.claimantContactCiphertext,
    })

    await syncCopyrightStaffAlerts({ noticeIds: [created.noticeId] })
    await syncCopyrightStaffAlertsFromRecovery()
    expect(await listOpenCopyrightStaffAlerts(staff, [created.noticeId])).toEqual([])
    await expect(
      acknowledgeCopyrightStaffAlert({ currentUser: staff, alertId: created.noticeId }),
    ).rejects.toMatchObject({ status: 409 })

    await withApprovedPolicy(actor.id, async () => {
      await syncCopyrightStaffAlerts({ noticeIds: [created.noticeId] })
      const open = await listOpenCopyrightStaffAlerts(staff, [created.noticeId])
      expect(open.map(alert => alert.condition)).toEqual(
        expect.arrayContaining(['awaiting_review', 'delivery_failed']),
      )
      expect(
        open.some(alert => alert.failure_ciphertext === created.claimantContactCiphertext),
      ).toBe(true)
    })

    const hidden = await listOpenCopyrightStaffAlerts(staff, [created.noticeId])
    expect(hidden).toEqual([])
    expect(await readCopyrightDeliveryObligation(intentId)).toMatchObject({ state: 'failed' })
  })
  it('keeps one alert when reconciliation runs twice', async () => {
    const staff = moderator(actor)
    const created = await insertCopyrightStaffAlertCase({
      imageId,
      actorUserId: actor.id,
      provisional: true,
    })
    await withApprovedPolicy(actor.id, async () => {
      await syncCopyrightStaffAlerts({ noticeIds: [created.noticeId] })
      await syncCopyrightStaffAlerts({ noticeIds: [created.noticeId] })
      const open = await listOpenCopyrightStaffAlerts(staff, [created.noticeId])
      expect(open.map(alert => alert.condition).sort()).toEqual([
        'awaiting_review',
        'urgent_filing',
      ])
      expect(new Set(open.map(alert => alert.id)).size).toBe(2)
    })
  })

  it('acknowledges one episode and opens the next delivery failure without clearing it', async () => {
    const staff = moderator(actor)
    const created = await insertCopyrightStaffAlertCase({
      imageId,
      actorUserId: actor.id,
      provisional: false,
    })
    await confirmCopyrightStaffAlertReview({
      restrictionId: created.restrictionId,
      actorUserId: actor.id,
    })
    const intentId = await insertCopyrightStaffAlertDelivery(created.noticeId, actor.id)
    await markCopyrightStaffAlertDelivery({ intentId, kind: 'failed' })
    await withApprovedPolicy(actor.id, async () => {
      await syncCopyrightStaffAlerts({ noticeIds: [created.noticeId] })
      const [alert] = await listOpenCopyrightStaffAlerts(staff, [created.noticeId])
      expect(alert?.condition).toBe('delivery_failed')
      expect(await acknowledgeCopyrightStaffAlert({ currentUser: staff, alertId: alert!.id })).toBe(
        true,
      )
      expect(await acknowledgeCopyrightStaffAlert({ currentUser: staff, alertId: alert!.id })).toBe(
        true,
      )
      expect(await listOpenCopyrightStaffAlerts(staff, [created.noticeId])).toEqual([])
      const history = await listCopyrightStaffAlertAcknowledgements(staff, [created.noticeId])
      expect(history).toHaveLength(1)
      expect(await readCopyrightDeliveryObligation(intentId)).toMatchObject({ state: 'failed' })

      expect(
        await replayFailedCopyrightDeliveryIntent({
          intentId,
          noticeId: created.noticeId,
          actorUserId: actor.id,
        }),
      ).toBe(true)
      await syncCopyrightStaffAlerts({ noticeIds: [created.noticeId] })
      expect(await listOpenCopyrightStaffAlerts(staff, [created.noticeId])).toEqual([])
      await markCopyrightStaffAlertDelivery({ intentId, kind: 'failed' })
      await syncCopyrightStaffAlerts({ noticeIds: [created.noticeId] })
      const reopened = await listOpenCopyrightStaffAlerts(staff, [created.noticeId])
      expect(reopened.map(row => row.condition)).toEqual(['delivery_failed'])
      expect(reopened[0]?.condition_opened_at).not.toEqual(history[0]?.condition_opened_at)
      expect(await listCopyrightStaffAlertAcknowledgements(staff, [created.noticeId])).toHaveLength(
        1,
      )
      expect(await readCopyrightDeliveryObligation(intentId)).toMatchObject({ state: 'failed' })
    })
  })

  it('opens a missed deadline and a bounce or retry without ending the obligation', async () => {
    const staff = moderator(actor)
    const created = await insertCopyrightStaffAlertCase({
      imageId,
      actorUserId: actor.id,
      provisional: false,
    })
    await confirmCopyrightStaffAlertReview({
      restrictionId: created.restrictionId,
      actorUserId: actor.id,
    })
    const deadlineId = await insertMissedCopyrightDeadline({
      noticeId: created.noticeId,
      actorUserId: actor.id,
    })
    const bouncedId = await insertCopyrightStaffAlertDelivery(created.noticeId, actor.id)
    const retryId = await insertCopyrightStaffAlertDelivery(created.noticeId, actor.id)
    await markCopyrightStaffAlertDelivery({ intentId: bouncedId, kind: 'bounced' })
    await markCopyrightStaffAlertDelivery({ intentId: retryId, kind: 'reconciliation' })
    await withApprovedPolicy(actor.id, async () => {
      await syncCopyrightStaffAlerts({ noticeIds: [created.noticeId] })
      const open = await listOpenCopyrightStaffAlerts(staff, [created.noticeId])
      expect(open.map(alert => alert.condition).sort()).toEqual([
        'delivery_bounced',
        'missed_deadline',
        'reconciliation_needed',
      ])
      const deadlineAlert = open.find(alert => alert.condition === 'missed_deadline')
      expect(
        await acknowledgeCopyrightStaffAlert({ currentUser: staff, alertId: deadlineAlert!.id }),
      ).toBe(true)
      expect(await readCopyrightDeadlineObligation(deadlineId)).toEqual({
        resolved_at: null,
        cancelled_at: null,
      })
      expect(await readCopyrightDeliveryObligation(bouncedId)).toMatchObject({ state: 'bounced' })
      expect(await readCopyrightDeliveryObligation(retryId)).toMatchObject({ state: 'pending' })
    })
  })

  it('resolves review alerts after human review and hides private fields from members', async () => {
    const staff = moderator(actor)
    const member = await createTestUser()
    const ordinary = await insertCopyrightStaffAlertCase({
      imageId,
      actorUserId: actor.id,
      provisional: false,
    })
    const urgent = await insertCopyrightStaffAlertCase({
      imageId,
      actorUserId: actor.id,
      provisional: true,
    })
    await withApprovedPolicy(actor.id, async () => {
      await syncCopyrightStaffAlerts({ noticeIds: [ordinary.noticeId, urgent.noticeId] })
      expect(
        (await listOpenCopyrightStaffAlerts(staff, [ordinary.noticeId])).map(
          alert => alert.condition,
        ),
      ).toEqual(['awaiting_review'])
      const urgentOpen = await listOpenCopyrightStaffAlerts(staff, [urgent.noticeId])
      expect(urgentOpen.map(alert => alert.condition).sort()).toEqual([
        'awaiting_review',
        'urgent_filing',
      ])
      const visible = await listOpenCopyrightStaffAlerts(staff, [ordinary.noticeId])
      expect(visible[0]).toMatchObject({
        work_description: ordinary.workDescription,
        claimant_contact_ciphertext: ordinary.claimantContactCiphertext,
      })
      expect(
        await listOpenCopyrightStaffAlerts(member, [ordinary.noticeId, urgent.noticeId]),
      ).toEqual([])
      await expect(
        acknowledgeCopyrightStaffAlert({ currentUser: member, alertId: visible[0]!.id }),
      ).rejects.toMatchObject({ status: 403 })
      await confirmCopyrightStaffAlertReview({
        restrictionId: ordinary.restrictionId,
        actorUserId: actor.id,
      })
      await confirmCopyrightStaffAlertReview({
        restrictionId: urgent.restrictionId,
        actorUserId: actor.id,
      })
      await syncCopyrightStaffAlerts({ noticeIds: [ordinary.noticeId, urgent.noticeId] })
      expect(
        await listOpenCopyrightStaffAlerts(staff, [ordinary.noticeId, urgent.noticeId]),
      ).toEqual([])
    })
  })

  it('retains the acknowledgement after the actor is erased and leaves the delivery failed', async () => {
    const erasedActorId = await insertErasableCopyrightStaffActor()
    const staff = moderator(actor)
    const created = await insertCopyrightStaffAlertCase({
      imageId,
      actorUserId: actor.id,
      provisional: false,
    })
    await confirmCopyrightStaffAlertReview({
      restrictionId: created.restrictionId,
      actorUserId: actor.id,
    })
    const intentId = await insertCopyrightStaffAlertDelivery(created.noticeId, actor.id)
    await markCopyrightStaffAlertDelivery({ intentId, kind: 'failed' })
    await withApprovedPolicy(erasedActorId, async () => {
      await syncCopyrightStaffAlerts({ noticeIds: [created.noticeId] })
      const [alert] = await listOpenCopyrightStaffAlerts(staff, [created.noticeId])
      expect(
        await acknowledgeCopyrightStaffAlert({
          currentUser: { ...staff, id: erasedActorId },
          alertId: alert!.id,
        }),
      ).toBe(true)
      await eraseCopyrightStaffActor(erasedActorId)
      const policy = await readCopyrightStaffAlertPolicy()
      expect(policy).toMatchObject({
        approved_by_user_id: null,
        revoked_at: null,
      })
      expect(policy?.approved_by_user_erased_at).toBeInstanceOf(Date)
      const [acknowledgement] = await listCopyrightStaffAlertAcknowledgements(staff, [
        created.noticeId,
      ])
      expect(acknowledgement).toMatchObject({ acknowledged_by_user_id: null })
      expect(acknowledgement?.acknowledged_by_user_erased_at).toBeInstanceOf(Date)
      expect(await listOpenCopyrightStaffAlerts(staff, [created.noticeId])).toEqual([])
      expect(await readCopyrightDeliveryObligation(intentId)).toMatchObject({ state: 'failed' })
    })
  })

  it('does not drop a delivery obligation when alert synchronization fails', async () => {
    const created = await insertCopyrightStaffAlertCase({
      imageId,
      actorUserId: actor.id,
      provisional: false,
    })
    const intentId = await insertCopyrightStaffAlertDelivery(created.noticeId, actor.id)
    await markCopyrightStaffAlertDelivery({ intentId, kind: 'failed' })
    await withApprovedPolicy(actor.id, async () => {
      await expect(syncCopyrightStaffAlerts({ noticeIds: ['not-a-uuid'] })).rejects.toThrow(
        /invalid input syntax for type uuid/,
      )
    })
    expect(await readCopyrightDeliveryObligation(intentId)).toMatchObject({ state: 'failed' })
  })

  it('syncs the next page of matching cases while the policy is active', async () => {
    const synced = await withApprovedPolicy(actor.id, () =>
      syncTrailingCopyrightStaffAlertPage({
        imageId,
        actorUserId: actor.id,
        currentUser: moderator(actor),
      }),
    )
    expect(synced.openNoticeIds).toEqual(synced.noticeIds)
  })
})
