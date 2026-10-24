import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { activitypub } from '@queues/activitypub/queues'
import { activityPubInboxConfig } from '@services/ap-inbox-activities'
import { activityPubInboxDeliveryExistsOnPrimaryForTest } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createActivityPubCapacityRequest } from '@voucha/test-helpers/activitypub-inbox-capacity-request'
import {
  getExistingActivityPubInboxDeliveryIdsForTest,
  deleteActivityPubInboxDeliveriesForTest,
} from '@voucha/test-helpers/entities/activitypub-inbox-storage'
import { insertExpiredVerifiedActivityPubInboxDeliveriesForTest } from '@voucha/test-helpers/entities/activitypub-inbox-owned-cleanup'
import { createRemoteActorFixture } from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { withActivityPubInboxHttpLockRace } from '@voucha/test-helpers/activitypub-inbox-http-lock-race'
import { acquireActivityPubInboxTestAdmission } from '@voucha/test-helpers/activitypub-inbox-test-admission'
import {
  cleanupActivityPubInboxRequest,
  registerActivityPubInboxRequestCleanup,
} from '@voucha/test-helpers/activitypub-inbox-request-enqueues'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('POST /ap/inbox owned real GlideMQ lifecycle', () => {
  beforeEach(() => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(activityPubInboxConfig, { async_delivery_enabled: true }),
    )
  })

  it('drains an admitted HTTP insert before deleting its late row and job and releasing capacity admission', async () => {
    const admission = await acquireActivityPubInboxTestAdmission('capacity')
    let closeRegistered = false
    onTestFinished(async () => {
      if (!closeRegistered) await admission.release()
    })
    let foreignInsertion: Promise<string[]> | undefined
    let request: Awaited<ReturnType<typeof createActivityPubCapacityRequest>> | undefined
    let response: Promise<{ status: number }> | undefined
    let closePromise: Promise<number> | undefined
    const close = () => {
      closePromise ??= (async () => {
        let responseFailed = false
        let responseError: unknown
        try {
          await response
        } catch (err) {
          responseFailed = true
          responseError = err
        }
        // The route awaits its real queue add before responding. Keep admission until the
        // response and exact job/row cleanup have both finished.
        const removed = request ? await cleanupActivityPubInboxRequest(request.activityId) : 0
        await admission.release()
        if (responseFailed) throw responseError
        return removed
      })()
      return closePromise
    }
    const actor = await createRemoteActorFixture()
    onTestFinished(async () => {
      const foreignIds = await foreignInsertion
      if (!foreignIds) return
      // A failed owned cleanup deliberately retains exclusive admission; it still protects this
      // exact foreign-row cleanup. After a successful close, take ordinary admission again.
      const ordinary = admission.evidence.released
        ? await acquireActivityPubInboxTestAdmission('ordinary')
        : undefined
      try {
        await deleteActivityPubInboxDeliveriesForTest(foreignIds)
      } finally {
        await ordinary?.release()
      }
    })
    onTestFinished(async () => {
      await close()
    })
    closeRegistered = true

    foreignInsertion = insertExpiredVerifiedActivityPubInboxDeliveriesForTest(1, actor.id)
    const foreignIds = await foreignInsertion
    request = await createActivityPubCapacityRequest(false)
    await withActivityPubInboxHttpLockRace(request.requestId, async control => {
      let responseSettled = false
      response = request!.send().then(result => {
        responseSettled = true
        return result
      })
      void response.catch(() => undefined)
      await control.insertInvoked
      expect(responseSettled).toBe(false)
      const admitted = admission.evidence
      expect(admitted.acquired.held).toBe(true)
      let closed = false
      const closing = close().then(removed => {
        closed = true
        return removed
      })
      void closing.catch(() => undefined)
      try {
        expect(await control.canAcquireExclusiveAdmission()).toBe(false)
        expect(closed).toBe(false)
      } finally {
        await control.releaseCounter()
      }
      const deliveryId = await control.returnedId
      expect((await response).status).toBe(202)
      expect(await closing).toBe(1)
      expect(await getExistingActivityPubInboxDeliveryIdsForTest([deliveryId])).toEqual([])
      expect(
        (await activitypub.searchJobs({ name: 'activitypub.processDelivery' })).filter(
          job => (job.data as { deliveryId?: string }).deliveryId === deliveryId,
        ),
      ).toEqual([])
      expect(await getExistingActivityPubInboxDeliveryIdsForTest(foreignIds)).toEqual(foreignIds)
      expect(admission.evidence.released).toEqual({
        backendPid: admitted.acquired.backendPid,
        unlocked: true,
        held: false,
      })
    })

    const sibling = await acquireActivityPubInboxTestAdmission('ordinary')
    let siblingCleanup: ReturnType<typeof registerActivityPubInboxRequestCleanup> | undefined
    try {
      const healthy = await createActivityPubCapacityRequest(false)
      siblingCleanup = registerActivityPubInboxRequestCleanup(healthy.activityId)
      expect((await healthy.send()).status).toBe(202)
      expect(await siblingCleanup.cleanup()).toBe(1)
      expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(healthy.activityId)).toBe(false)
      expect(await getExistingActivityPubInboxDeliveryIdsForTest(foreignIds)).toEqual(foreignIds)
    } finally {
      await siblingCleanup?.cleanup()
      await sibling.release()
    }
  })
})
