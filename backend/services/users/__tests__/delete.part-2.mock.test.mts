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
import {
  createTestUser,
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  expireUserDataRequestForTest,
  getUserDataRequestStatusAndS3KeyForTest,
} from '@voucha/test-helpers'
import { getUserDeletionRequestForTest } from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'
import { deleteUser } from '../delete.mts'
import {
  deleteUserAndDrainForTest,
  drainUserDeletionForTest,
} from '@voucha/test-helpers/services/users/delete-test-support'
import { getPrivateUserByAny } from '../get.mts'
import * as accountDataRequests from '@services/account-data-requests'

const SANITIZED_CUSTOMER = { email: '', name: '', metadata: { redacted: 'true' } }

function stripeUpdateFor(requestId: string, customerId: string) {
  return [
    customerId,
    SANITIZED_CUSTOMER,
    { idempotencyKey: `user-deletion__${requestId}__stripe__${customerId}` },
  ]
}

function sentS3Keys(): string[] {
  return mockS3Send.mock.calls
    .map(([command]) => (command as { input: { Bucket: string; Key: string } }).input)
    .map(input => {
      expect(input.Bucket).toBe(S3Buckets.userExports)
      return input.Key
    })
    .toSorted()
}

describe('deleteUser — Stripe redaction', () => {
  beforeEach(() => {
    mockStripeUpdate.mockReset()
    mockS3Send.mockReset()
    mockStripeUpdate.mockResolvedValue({})
    mockS3Send.mockResolvedValue({})
  })

  it('calls sanitizeStripeCustomer for each distinct stripe customer ID on the membership', async () => {
    const user = await createTestUser()
    const stripeCustomerId = `cus_test_${Math.random().toString(36).slice(2)}`
    await createTestMembership({
      user_id: user.id,
      stripe_customer_id: stripeCustomerId,
    })
    const attempt = await deleteUser(user, user)
    await drainUserDeletionForTest(attempt)

    expect(mockStripeUpdate).toHaveBeenCalledExactlyOnceWith(
      ...stripeUpdateFor(attempt.requestId, stripeCustomerId),
    )
  })

  it('does not call sanitizeStripeCustomer when user has no membership', async () => {
    const user = await createTestUser()

    await deleteUserAndDrainForTest(user, user)

    expect(mockStripeUpdate).not.toHaveBeenCalled()
  })

  it('does not call sanitizeStripeCustomer when membership has no stripe customer ID', async () => {
    const user = await createTestUser()
    await createTestMembership({
      user_id: user.id,
      stripe_customer_id: null,
    })

    await deleteUserAndDrainForTest(user, user)

    expect(mockStripeUpdate).not.toHaveBeenCalled()
  })

  it('does not sanitize the purchaser Stripe customer for a family beneficiary', async () => {
    const user = await createTestUser()
    const applicationId = `family-delete-${Math.random().toString(36).slice(2)}`
    const purchaserCustomerId = `cus_family_purchaser_${Math.random().toString(36).slice(2)}`
    const sku = await createTestSku({
      provider_application_id: applicationId,
      provider_environment: 'production',
    })
    await createTestFamilyMembership({
      applicationId,
      expiresAt: new Date(Date.now() + 60_000),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      providerAccountId: purchaserCustomerId,
      userId: user.id,
    })

    await deleteUserAndDrainForTest(user, user)

    expect(mockStripeUpdate).not.toHaveBeenCalled()
  })

  it('calls sanitizeStripeCustomer only once for deduplicated customer IDs', async () => {
    const user = await createTestUser()
    const stripeCustomerId = `cus_test_${Math.random().toString(36).slice(2)}`
    // Create one active + one cancelled membership with the same stripe_customer_id.
    // The unique index idx_memberships__user_active only covers active/past_due/paused rows,
    // so a cancelled row with a different status avoids the constraint.
    await createTestMembership({ user_id: user.id, stripe_customer_id: stripeCustomerId })
    await createTestMembership({
      user_id: user.id,
      stripe_customer_id: stripeCustomerId,
      status: 'cancelled',
    })

    const attempt = await deleteUser(user, user)
    await drainUserDeletionForTest(attempt)

    expect(mockStripeUpdate).toHaveBeenCalledExactlyOnceWith(
      ...stripeUpdateFor(attempt.requestId, stripeCustomerId),
    )
  })

  it('commits the privacy fence but keeps completion retryable when Stripe redaction fails', async () => {
    mockStripeUpdate.mockRejectedValueOnce(new Error('Stripe API error'))

    const user = await createTestUser()
    const stripeCustomerId = `cus_test_${Math.random().toString(36).slice(2)}`
    await createTestMembership({ user_id: user.id, stripe_customer_id: stripeCustomerId })

    const attempt = await deleteUser(user, user)
    await expect(drainUserDeletionForTest(attempt)).rejects.toThrow('Stripe API error')

    const deletedUser = await getPrivateUserByAny(user.id)
    expect(deletedUser).toBeNull()
    // Resume the attempt that failed: earlier phases already rotated the initial token.
    const failed = await getUserDeletionRequestForTest(attempt.requestId)
    expect(failed).toMatchObject({ currentPhase: 'external-work', completedAt: null })
    await expect(
      drainUserDeletionForTest({
        requestId: attempt.requestId,
        processingAttemptId: failed!.processingAttemptId,
      }),
    ).resolves.toBeUndefined()
    expect(mockStripeUpdate.mock.calls).toEqual([
      stripeUpdateFor(attempt.requestId, stripeCustomerId),
      stripeUpdateFor(attempt.requestId, stripeCustomerId),
    ])
    const completed = await getUserDeletionRequestForTest(attempt.requestId)
    expect(completed?.completedAt).toBeInstanceOf(Date)
  })
})

describe('deleteUser — data export cleanup', () => {
  beforeEach(() => {
    mockStripeUpdate.mockReset()
    mockS3Send.mockReset()
    mockStripeUpdate.mockResolvedValue({})
    mockS3Send.mockResolvedValue({})
  })

  it('marks pending exports failed without deleting S3 objects', async () => {
    const user = await createTestUser()
    const request = await accountDataRequests.createDataRequest(user.id, user.id)

    await deleteUserAndDrainForTest(user, user)

    await expect(getUserDataRequestStatusAndS3KeyForTest(request.id)).resolves.toEqual({
      status: 'failed',
      s3_key: null,
    })
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  it('deletes S3 objects of ready exports whose deadline has already passed', async () => {
    const user = await createTestUser()
    const request = await accountDataRequests.createDataRequest(user.id, user.id)
    expect(await accountDataRequests.markDataRequestProcessing(request.id)).toBe(true)
    const s3Key = `expired-export-${Math.random().toString(36).slice(2, 10)}.zip`
    expect(
      await accountDataRequests.markDataRequestReady(
        request.id,
        s3Key,
        new Date(Date.now() + 60_000),
      ),
    ).toBe(true)
    await expireUserDataRequestForTest(request.id)

    await deleteUserAndDrainForTest(user, user)

    await expect(getUserDataRequestStatusAndS3KeyForTest(request.id)).resolves.toEqual({
      status: 'expired',
      s3_key: null,
    })
    expect(sentS3Keys()).toEqual(
      [
        accountDataRequests.getExportS3Key(request.id, request.processing_attempt_id),
        s3Key,
      ].toSorted(),
    )
  })

  it('deletes S3 objects of currently-active ready exports', async () => {
    const user = await createTestUser()
    const request = await accountDataRequests.createDataRequest(user.id, user.id)
    expect(await accountDataRequests.markDataRequestProcessing(request.id)).toBe(true)
    const s3Key = `active-export-${Math.random().toString(36).slice(2, 10)}.zip`
    expect(
      await accountDataRequests.markDataRequestReady(
        request.id,
        s3Key,
        new Date(Date.now() + 60_000),
      ),
    ).toBe(true)

    await deleteUserAndDrainForTest(user, user)

    await expect(getUserDataRequestStatusAndS3KeyForTest(request.id)).resolves.toEqual({
      status: 'expired',
      s3_key: null,
    })
    expect(sentS3Keys()).toEqual(
      [
        accountDataRequests.getExportS3Key(request.id, request.processing_attempt_id),
        s3Key,
      ].toSorted(),
    )
  })
})
