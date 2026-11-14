import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockS3Send, mockStripeUpdate } = vi.hoisted(() => ({
  mockS3Send: vi.fn<VitestLooseMock>(),
  mockStripeUpdate: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal<typeof import('@modules/aws')>()),
  S3ImagesClient: { send: mockS3Send } as unknown as typeof import('@modules/aws').S3ImagesClient,
}))

vi.mock<typeof import('@modules/stripe/client')>(
  import('@modules/stripe/client'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/stripe/client')>()),
    getStripeClient: () =>
      ({ customers: { update: mockStripeUpdate } }) as unknown as ReturnType<
        typeof import('@modules/stripe/client').getStripeClient
      >,
  }),
)

import { S3Buckets } from '@modules/aws'
import * as cachePurge from '@services/entity-cache/purge'
import * as rssSnapshotGeneration from '@services/entity-cache/rss-snapshot-generation'
import { addUserDeletionExternalWorks, createUserDeletionRequest } from '@services/user-deletions'
import {
  createTestUser,
  isTestUserDeletionExternalWorkCompleted,
  rotateTestUserDeletionAttemptDuringProviderCall,
} from '@voucha/test-helpers'
import { addTestStripeDeletionWork } from '@voucha/test-helpers/entities/stripe-customer-deletion'
import {
  getUserDeletionCompletionAuditForTest,
  markUserDeletionAttemptStartedForTest,
} from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'
import { executeUserDeletionExternalWork } from './delete-external-work-dispatch.mts'
import { processUserDeletionExternalWork } from './delete-phase-external-work.mts'

const SANITIZED_CUSTOMER = { email: '', name: '', metadata: { redacted: 'true' } }

function sentS3Inputs(): unknown[] {
  return mockS3Send.mock.calls.map(([command]) => (command as { input: unknown }).input)
}

describe('user deletion provider work', () => {
  beforeEach(() => {
    mockS3Send.mockReset()
    mockStripeUpdate.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects an unsupported persisted work kind before invoking providers', async () => {
    const work = {
      id: randomUUID(),
      work_kind: 'unknown' as 's3-export',
      work_key: 'test/ignored',
      relation_impact_id: null,
      stripe_customer_id: null,
    }

    await expect(
      executeUserDeletionExternalWork(work, randomUUID(), async () => undefined),
    ).rejects.toThrow('Unsupported user deletion external work kind: unknown')
    expect(mockS3Send).not.toHaveBeenCalled()
    expect(mockStripeUpdate).not.toHaveBeenCalled()
  })

  it('routes relation-impact work to the fenced relation effects callback', async () => {
    const requestId = randomUUID()
    const impactId = randomUUID()
    const processRelationEffects = vi.fn<(requestId: string, impactId: string) => Promise<void>>(
      async () => undefined,
    )

    await executeUserDeletionExternalWork(
      {
        id: randomUUID(),
        work_kind: 'entity-relation-effects',
        work_key: null,
        relation_impact_id: impactId,
        stripe_customer_id: null,
      },
      requestId,
      processRelationEffects,
    )

    expect(processRelationEffects).toHaveBeenCalledExactlyOnceWith(requestId, impactId)
  })

  it('keeps required provider work pending until the provider succeeds', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWorks(request.id, 's3-export', ['test/export.zip'])
    await markUserDeletionAttemptStartedForTest(request.id, request.processingAttemptId)
    mockS3Send.mockRejectedValueOnce(new Error('S3 unavailable')).mockResolvedValue({})

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).rejects.toThrow('S3 unavailable')
    await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(false)
    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).resolves.toEqual({ hasMore: true })
    await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(true)
    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).resolves.toEqual({ hasMore: false })
    expect(sentS3Inputs()).toEqual([
      { Bucket: S3Buckets.userExports, Key: 'test/export.zip' },
      { Bucket: S3Buckets.userExports, Key: 'test/export.zip' },
    ])
  })

  it.each(['legal-removal', 'precise-user'] as const)(
    'completes %s cache-tag work through the cache purge',
    async tagKind => {
      const user = await createTestUser()
      const request = await createUserDeletionRequest(user.id, user.id)
      const cacheTag = tagKind === 'legal-removal' ? tagKind : `user:${user.id}`
      await addUserDeletionExternalWorks(request.id, 'cloudflare-cache-tag', [cacheTag])
      await markUserDeletionAttemptStartedForTest(request.id, request.processingAttemptId)
      const purge = vi.spyOn(cachePurge, 'purgeCacheTags')

      await expect(
        processUserDeletionExternalWork(request.id, request.processingAttemptId),
      ).resolves.toEqual({ hasMore: true })
      await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(true)
      await expect(
        processUserDeletionExternalWork(request.id, request.processingAttemptId),
      ).resolves.toEqual({ hasMore: false })
      expect(purge).toHaveBeenCalledExactlyOnceWith([cacheTag])
    },
  )

  it('processes the legal purge after sibling work and retries its failure', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    const exportKey = `test/${randomUUID()}.zip`
    await addUserDeletionExternalWorks(request.id, 'cloudflare-cache-tag', ['legal-removal'])
    await addUserDeletionExternalWorks(request.id, 's3-export', [exportKey])
    await markUserDeletionAttemptStartedForTest(request.id, request.processingAttemptId)
    mockS3Send.mockResolvedValue({})
    const generation = await rssSnapshotGeneration.getRssSnapshotLegalGeneration()
    const purge = vi.spyOn(cachePurge, 'purgeCacheTags')

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).resolves.toEqual({ hasMore: true })
    expect(sentS3Inputs()).toEqual([{ Bucket: S3Buckets.userExports, Key: exportKey }])
    expect(purge).not.toHaveBeenCalled()
    expect(await rssSnapshotGeneration.getRssSnapshotLegalGeneration()).toBe(generation)

    vi.stubEnv('CF_WORKER_ROUTE', 'https://127.0.0.1:9')
    vi.stubEnv('CF_WORKER_SECRET', 'test-secret')
    vi.stubEnv('SKIP_CACHE_PURGE', 'false')
    try {
      await expect(
        processUserDeletionExternalWork(request.id, request.processingAttemptId),
      ).rejects.toThrow('Cache purge request failed')
      expect(
        (await getUserDeletionCompletionAuditForTest(request.id)).externalWorks.find(
          work => work.workKey === 'legal-removal',
        )?.completedAt,
      ).toBeNull()
      vi.stubEnv('ENVIRONMENT', 'staging')
      vi.stubEnv('SKIP_CACHE_PURGE', 'true')
      await expect(
        processUserDeletionExternalWork(request.id, request.processingAttemptId),
      ).rejects.toThrow('Cache purge confirmation required')
      expect(
        (await getUserDeletionCompletionAuditForTest(request.id)).externalWorks.find(
          work => work.workKey === 'legal-removal',
        )?.completedAt,
      ).toBeNull()
      vi.stubEnv('ENVIRONMENT', 'development')
      await expect(
        processUserDeletionExternalWork(request.id, request.processingAttemptId),
      ).resolves.toEqual({ hasMore: true })
      expect(
        (await getUserDeletionCompletionAuditForTest(request.id)).externalWorks.find(
          work => work.workKey === 'legal-removal',
        )?.completedAt,
      ).toBeInstanceOf(Date)
      expect(purge).toHaveBeenCalledTimes(3)
      expect(await rssSnapshotGeneration.getRssSnapshotLegalGeneration()).not.toBe(generation)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('completes Stripe work when the customer is already missing', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addTestStripeDeletionWork(request.id, 'cus_already_deleted')
    await markUserDeletionAttemptStartedForTest(request.id, request.processingAttemptId)
    mockStripeUpdate.mockRejectedValue(makeStripeMissingCustomerError())

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).resolves.toEqual({ hasMore: true })
    await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(true)
    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).resolves.toEqual({ hasMore: false })
    expect(mockStripeUpdate).toHaveBeenCalledExactlyOnceWith(
      'cus_already_deleted',
      SANITIZED_CUSTOMER,
      {
        idempotencyKey: `user-deletion__${request.id}__stripe__cus_already_deleted`,
      },
    )
  })

  it('keeps Stripe work retryable for errors other than a missing customer', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addTestStripeDeletionWork(request.id, 'cus_retryable')
    await markUserDeletionAttemptStartedForTest(request.id, request.processingAttemptId)
    const stripeError = Object.assign(new Error('Invalid customer update'), {
      code: 'parameter_invalid_empty',
      param: 'email',
    })
    mockStripeUpdate.mockRejectedValueOnce(stripeError).mockResolvedValue({})

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).rejects.toBe(stripeError)
    await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(false)
    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).resolves.toEqual({ hasMore: true })
    await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(true)
    expect(mockStripeUpdate).toHaveBeenCalledTimes(2)
  })

  it('does not start provider work after an attempt loses ownership', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWorks(request.id, 's3-export', ['test/fenced-export.zip'])

    await expect(processUserDeletionExternalWork(request.id, randomUUID())).rejects.toThrow(
      'lost ownership',
    )
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  it('does not complete provider work after an attempt loses ownership during the call', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWorks(request.id, 's3-export', ['test/rotated-export.zip'])
    await markUserDeletionAttemptStartedForTest(request.id, request.processingAttemptId)
    const successorAttemptId = randomUUID()
    mockS3Send.mockImplementation(async () => {
      await rotateTestUserDeletionAttemptDuringProviderCall(request.id, successorAttemptId)
      return {}
    })

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).rejects.toThrow('lost ownership')
    await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(false)
  })

  it('does not complete missing-customer Stripe work after the attempt loses ownership', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addTestStripeDeletionWork(request.id, 'cus_rotated')
    await markUserDeletionAttemptStartedForTest(request.id, request.processingAttemptId)
    const successorAttemptId = randomUUID()
    mockStripeUpdate.mockImplementation(async () => {
      await rotateTestUserDeletionAttemptDuringProviderCall(request.id, successorAttemptId)
      throw makeStripeMissingCustomerError()
    })

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).rejects.toThrow('lost ownership')
    await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(false)
  })
})

function makeStripeMissingCustomerError(): Error & { code: string; param: string } {
  return Object.assign(new Error('Provider detail changed'), {
    code: 'resource_missing',
    param: 'id',
  })
}
