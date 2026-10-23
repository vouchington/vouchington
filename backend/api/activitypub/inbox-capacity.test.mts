import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import { registerActivityPubInboxAdmission } from '@voucha/test-helpers/activitypub-inbox-transitions'
import { activitypub } from '@queues/activitypub/queues'
import { activityPubInboxConfig } from '@services/ap-inbox-activities'
import {
  activityPubInboxDeliveryExistsOnPrimaryForTest,
  getActivityPubInboxDeliveryIdForTest,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { fillActivityPubInboxRowCapacity } from '@voucha/test-helpers/activitypub-inbox-capacity-fixtures'
import { createActivityPubCapacityRequest } from '@voucha/test-helpers/activitypub-inbox-capacity-request'
import { registerActivityPubInboxRequestCleanup } from '@voucha/test-helpers/activitypub-inbox-request-enqueues'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'

registerActivityPubInboxAdmission('capacity')

describe('POST /ap/inbox capacity handling', () => {
  beforeEach(() => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(activityPubInboxConfig, { async_delivery_enabled: true }),
    )
  })

  it('returns 503 with Retry-After 300 without persisting a delivery when unverified storage is full', async () => {
    await fillActivityPubInboxRowCapacity(0)
    const request = await createActivityPubCapacityRequest(false)
    registerActivityPubInboxRequestCleanup(request.activityId)
    const response = await request.send()
    expect(response.status).toBe(503)
    expect(response.headers['retry-after']).toBe('300')
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(request.activityId)).toBe(false)
  })

  it('maps only the named PostgreSQL capacity violation to 503', async () => {
    const request = await createActivityPubCapacityRequest(false)
    registerActivityPubInboxRequestCleanup(request.activityId)
    const { result: response, error } = await withPostgresPoolQueryFailureForTest(
      '/* acceptActivityPubInboxDelivery */',
      () => request.send(),
      { command: 'INSERT', requestId: request.requestId },
    )
    expect(error).toMatchObject({ code: '25P02' })
    expect(response.status).toBe(500)
    expect(response.headers['retry-after']).toBeUndefined()
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(request.activityId)).toBe(false)
  })

  it('allows a cached verified signer to bypass the unverified capacity cap', async () => {
    await fillActivityPubInboxRowCapacity(0)
    const request = await createActivityPubCapacityRequest(true)
    registerActivityPubInboxRequestCleanup(request.activityId)
    const response = await request.send()
    expect(response.status).toBe(202)
    expect(response.headers['retry-after']).toBeUndefined()
    const deliveryId = await getActivityPubInboxDeliveryIdForTest(request.activityId)
    expect(deliveryId).toBeDefined()
    const jobs = (await activitypub.searchJobs({ name: 'activitypub.processDelivery' })).filter(
      job => (job.data as { deliveryId?: string }).deliveryId === deliveryId,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.data).toMatchObject({ deliveryId })
  })
})
