import { describe, expect, it } from 'vitest'
import { createFederatedUser } from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import {
  withPostgresTransactionForTest,
  withCommittedPostgresTransactionForTest,
} from '@voucha/test-helpers/postgres-transaction'
import {
  withCapturedTestQueries,
  countCapturedQueriesByAnnotation,
} from '@voucha/test-helpers/query-capture'
import {
  advanceFederationReplayFloorForTest,
  ensureFederationReplayFloorForTest,
  isReplayFloorLockedForTest,
} from '@voucha/test-helpers/federation-retention-replay'
import { prepareActivityDistributionPage } from '@services/activitypub-delivery'
import { getOrCreateActorKeyPair } from '@services/ap-actor-keys'
import { mintUUIDv7 } from '@modules/utils/ids'
import type { DeliverActivityData } from '@queues/activitypub/enqueues/delivery'
import { distributeActivity, deliverActivity } from '../delivery.mts'

async function admittedData(): Promise<Extract<DeliverActivityData, { activityType: 'Follow' }>> {
  const source = await createFederatedUser()
  const target = await createFederatedUser()
  await getOrCreateActorKeyPair(source.id)
  return {
    activityId: mintUUIDv7(),
    activityType: 'Follow',
    sourceUserId: source.id,
    targetUserId: target.id,
    inboxUrl: 'https://remote.example/inbox',
  }
}

describe('outbound replay admission boundary', () => {
  it('reads the floor once in the distribution job and lets already-admitted delivery drain after it advances', async () => {
    const data = await admittedData()
    const admitted = await withCapturedTestQueries(() => distributeActivity(data))
    expect(admitted.result).toMatchObject({ completed: true })
    expect(countCapturedQueriesByAnnotation(admitted.queries, 'lockActivityPubReplayFloor')).toBe(1)
    await withPostgresTransactionForTest(async query => {
      await advanceFederationReplayFloorForTest(query, 'outbound', new Date(Date.now() + 1_000))
      expect(
        await prepareActivityDistributionPage(mintUUIDv7(), data.sourceUserId, { query }),
      ).toEqual({ status: 'expired' })
      let externalDelivery = false
      // Only the external HTTP integration boundary is replaced; user/key/age/database reads are real.
      expect(
        await deliverActivity(data, {
          deliverActivityToInbox: async () => {
            externalDelivery = true
          },
        }),
      ).toEqual({ delivered: true })
      expect(externalDelivery).toBe(true)
    })
  })

  it('holds no floor lock while the external HTTP boundary is pending', async () => {
    const data = await admittedData()
    await withCommittedPostgresTransactionForTest(query =>
      ensureFederationReplayFloorForTest(query, 'outbound'),
    )
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const pending = withCapturedTestQueries(() =>
      deliverActivity(data, {
        deliverActivityToInbox: async () => {
          started.resolve()
          await release.promise
        },
      }),
    )
    try {
      await Promise.race([
        started.promise,
        pending.then(() => {
          throw new Error('Delivery completed before entering HTTP')
        }),
      ])
      expect(await isReplayFloorLockedForTest('outbound')).toBe(false)
    } finally {
      release.resolve()
    }
    const completed = await pending
    expect(completed.result).toEqual({ delivered: true })
    expect(countCapturedQueriesByAnnotation(completed.queries, 'lockActivityPubReplayFloor')).toBe(
      0,
    )
  })
})
