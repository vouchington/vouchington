import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueContinueRecoverMicrosoftStoreSources,
  enqueueReconcileMicrosoftStoreSource,
  enqueueRecoverMicrosoftStoreSources,
} from '@queues/memberships/enqueues'
import { memberships } from '@queues/memberships/queues'
import {
  createMembershipVerification,
  getMembershipByUserId,
  getMembershipSourceIdByMembershipId,
} from '@services/memberships'
import {
  processMicrosoftStoreMembershipVerification,
  type MicrosoftStoreClient,
} from '@services/memberships/microsoft'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { getEnqueuedJobId, isDeduplicatedEnqueue } from '@voucha/test-helpers/queue-jobs'
import { createTestMicrosoftStoreIdKey } from '@voucha/test-helpers/microsoft-store-id-key'
import { processMicrosoftStoreSource, recoverMicrosoftStoreSources } from './microsoft-store.mts'

vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

describe('Microsoft Store source recovery with real GlideMQ', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('ignores a reconciliation job when its durable source is absent', async () => {
    await expect(processMicrosoftStoreSource({ sourceId: randomUUID() })).resolves.toBeUndefined()
  })

  it('throttles the durable recovery scan to one job per interval', async () => {
    const first = await enqueueRecoverMicrosoftStoreSources()
    const jobId = `microsoft-store-recovery__${Math.floor(Date.now() / 3_600_000)}`
    const accepted = !isDeduplicatedEnqueue(first)
    try {
      expect(accepted ? getEnqueuedJobId(first) : jobId).toBe(jobId)
      const createdJob = accepted ? await memberships.getJob(jobId) : null
      const createdJobMetadata = createdJob
        ? {
            id: createdJob.id,
            name: createdJob.name,
            data: createdJob.data,
            deduplication: createdJob.opts.deduplication,
          }
        : null
      const expectedJobMetadata = accepted
        ? {
            id: jobId,
            name: 'recoverMicrosoftStoreSources',
            data: {},
            deduplication: {
              id: 'microsoft-store-recovery',
              mode: 'throttle',
              ttl: 3_600_000,
            },
          }
        : null
      expect(createdJobMetadata).toEqual(expectedJobMetadata)
      expect(isDeduplicatedEnqueue(await enqueueRecoverMicrosoftStoreSources())).toBe(true)
    } finally {
      if (accepted) await (await memberships.getJob(jobId))?.remove()
    }
  })

  it('serializes an immediate continuation independently of the hourly throttle', async () => {
    const continuation = await enqueueContinueRecoverMicrosoftStoreSources()
    const jobId = getEnqueuedJobId(continuation)

    try {
      await expect(memberships.getJob(jobId)).resolves.toMatchObject({
        id: jobId,
        name: 'recoverMicrosoftStoreSources',
        data: {},
        opts: {
          ordering: { key: 'microsoft-store-recovery', concurrency: 1 },
          priority: 100,
        },
      })
      expect((await memberships.getJob(jobId))?.opts.deduplication).toBeUndefined()
    } finally {
      await (await memberships.getJob(jobId))?.remove()
    }
  })

  it('restores a lost known-source job from PostgreSQL and keeps concurrent recovery deduplicated', async () => {
    const fixture = await createActiveMicrosoftStoreFixture()
    const verificationJobId = `membership-verification__${fixture.verificationId}`
    let sourceJobId: string | undefined

    try {
      sourceJobId = getEnqueuedJobId(
        await enqueueReconcileMicrosoftStoreSource({ sourceId: fixture.sourceId }),
      )
      const initialJob = await memberships.getJob(sourceJobId)
      if (!initialJob) throw new Error('Expected the known-source enqueue to create its stable job')

      // Simulate Valkey losing the accepted job while the active source remains durable in PostgreSQL.
      await initialJob.remove()
      await expect(memberships.getJob(sourceJobId)).resolves.toBeNull()

      await expect(recoverMicrosoftStoreSources()).resolves.toBeUndefined()
      await Promise.all([recoverMicrosoftStoreSources(), recoverMicrosoftStoreSources()])

      await expect(memberships.getJob(sourceJobId)).resolves.toMatchObject({
        id: sourceJobId,
        name: 'reconcileMicrosoftStoreSource',
        data: { sourceId: fixture.sourceId },
        opts: {
          deduplication: { id: sourceJobId, mode: 'simple' },
          ordering: { key: `microsoft-store-source:${fixture.sourceId}`, concurrency: 1 },
        },
      })
    } finally {
      await Promise.all(
        [sourceJobId, verificationJobId].map(async jobId => {
          if (!jobId) return
          await (await memberships.getJob(jobId))?.remove()
        }),
      )
    }
  })
})

async function createActiveMicrosoftStoreFixture(): Promise<{
  verificationId: string
  sourceId: string
}> {
  const user = await createTestUser()
  const applicationId = `voucha.microsoft.${randomUUID()}`
  const productId = `9TEST${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const skuId = '0001'
  const clientId = `microsoft-client-${randomUUID()}`
  vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', clientId)
  const sku = await createTestSku({ plan: 'plus' })
  await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'microsoft_store',
    environment: 'test',
    applicationId,
    providerProductId: productId,
    skuId,
  })
  const expiresAt = new Date(Date.now() + 30 * 86_400_000)
  const verification = await createMembershipVerification({
    userId: user.id,
    provider: 'microsoft_store',
    purchaseIntentId: null,
    idempotencyKey: randomUUID(),
    trustedProviderContext: { environment: 'test', applicationId },
    evidence: {
      collections_store_id_key: createTestMicrosoftStoreIdKey({
        kind: 'collections',
        clientId,
        userId: user.id,
      }),
      purchase_store_id_key: createTestMicrosoftStoreIdKey({
        kind: 'purchase',
        clientId,
        userId: user.id,
      }),
      publisher_user_id: user.id,
      product_id: productId,
      sku_id: skuId,
    },
  })
  await processMicrosoftStoreMembershipVerification(verification.id, {
    client: clientFixture(productId, skuId, expiresAt),
  })
  const membership = await getMembershipByUserId(user.id)
  if (!membership) throw new Error('Microsoft Store fixture was not projected')
  const sourceId = await getMembershipSourceIdByMembershipId(membership.id)
  if (!sourceId) throw new Error('Microsoft Store fixture source was not projected')
  return { verificationId: verification.id, sourceId }
}

function clientFixture(productId: string, skuId: string, expiresAt: Date): MicrosoftStoreClient {
  const itemId = `collection-${randomUUID()}`
  const recurrenceId = `recurrence-${randomUUID()}`
  return {
    queryCollections: async () => [
      {
        id: itemId,
        recurrenceData: recurrenceId,
        modifiedDate: new Date().toISOString(),
        productId,
        skuId,
        endDate: expiresAt.toISOString(),
        status: 'Active',
      },
    ],
    queryRecurrences: async () => [
      {
        id: recurrenceId,
        productId,
        skuId,
        startTime: new Date(Date.now() - 86_400_000).toISOString(),
        expirationTime: expiresAt.toISOString(),
        lastModified: new Date().toISOString(),
        recurrenceState: 'Active',
        autoRenew: true,
      },
    ],
  }
}
