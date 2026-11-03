import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
import { addUserDeletionExternalWorks, createUserDeletionRequest } from '@services/user-deletions'
import {
  createTestUser,
  isTestUserDeletionExternalWorkCompleted,
  rotateTestUserDeletionAttemptDuringProviderCall,
} from '@voucha/test-helpers'
import { addTestStripeDeletionWork } from '@voucha/test-helpers/entities/stripe-customer-deletion'
import { markUserDeletionAttemptStartedForTest } from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'
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

  it('completes cache-tag work through the cache purge', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWorks(request.id, 'cloudflare-cache-tag', [`user:${user.id}`])
    await markUserDeletionAttemptStartedForTest(request.id, request.processingAttemptId)

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).resolves.toEqual({ hasMore: true })
    await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(true)
    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).resolves.toEqual({ hasMore: false })
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
