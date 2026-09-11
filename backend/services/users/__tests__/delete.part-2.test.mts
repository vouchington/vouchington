import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createTestUser,
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  expireUserDataRequestForTest,
  getUserDataRequestStatusAndS3KeyForTest,
} from '@voucha/test-helpers'
import { deleteUser } from '../delete.mts'
import { deleteUserAndDrainForTest, drainUserDeletionForTest } from '../delete-test-support.mts'
import { getPrivateUserByAny } from '../get.mts'
import * as accountDataRequests from '@services/account-data-requests'

const mockRedactStripe = vi.fn<(stripeCustomerId: string) => Promise<unknown>>()
const mockDeleteExport = vi.fn<(s3Keys: string[]) => Promise<void>>()

function cleanupDeps() {
  return {
    sanitizeStripeCustomer: mockRedactStripe,
    deleteExportsFromS3: mockDeleteExport,
  }
}

describe('deleteUser — Stripe redaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedactStripe.mockResolvedValue({})
    mockDeleteExport.mockResolvedValue(undefined)
  })

  it('calls sanitizeStripeCustomer for each distinct stripe customer ID on the membership', async () => {
    const user = await createTestUser()
    const stripeCustomerId = `cus_test_${Math.random().toString(36).slice(2)}`
    await createTestMembership({
      user_id: user.id,
      stripe_customer_id: stripeCustomerId,
    })
    await deleteUserAndDrainForTest(user, user, cleanupDeps())

    expect(mockRedactStripe).toHaveBeenCalledWith(stripeCustomerId)
  })

  it('does not call sanitizeStripeCustomer when user has no membership', async () => {
    mockRedactStripe.mockClear()
    const user = await createTestUser()

    await deleteUserAndDrainForTest(user, user, cleanupDeps())

    expect(mockRedactStripe).not.toHaveBeenCalled()
  })

  it('does not call sanitizeStripeCustomer when membership has no stripe customer ID', async () => {
    mockRedactStripe.mockClear()
    const user = await createTestUser()
    await createTestMembership({
      user_id: user.id,
      stripe_customer_id: null,
    })

    await deleteUserAndDrainForTest(user, user, cleanupDeps())

    expect(mockRedactStripe).not.toHaveBeenCalled()
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

    await deleteUserAndDrainForTest(user, user, cleanupDeps())

    expect(mockRedactStripe).not.toHaveBeenCalled()
  })

  it('calls sanitizeStripeCustomer only once for deduplicated customer IDs', async () => {
    mockRedactStripe.mockClear()
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

    await deleteUserAndDrainForTest(user, user, cleanupDeps())

    const calls = mockRedactStripe.mock.calls.filter(([id]) => id === stripeCustomerId)
    expect(calls).toHaveLength(1)
  })

  it('commits the privacy fence but keeps completion retryable when Stripe redaction fails', async () => {
    mockRedactStripe.mockClear()
    mockRedactStripe.mockRejectedValueOnce(new Error('Stripe API error'))

    const user = await createTestUser()
    const stripeCustomerId = `cus_test_${Math.random().toString(36).slice(2)}`
    await createTestMembership({ user_id: user.id, stripe_customer_id: stripeCustomerId })

    const attempt = await deleteUser(user, user)
    await expect(drainUserDeletionForTest(attempt, cleanupDeps())).rejects.toThrow(
      'Stripe API error',
    )

    const deletedUser = await getPrivateUserByAny(user.id)
    expect(deletedUser).toBeNull()
    mockRedactStripe.mockResolvedValue({})
    await expect(drainUserDeletionForTest(attempt, cleanupDeps())).resolves.toBeUndefined()
  })
})

describe('deleteUser — data export cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedactStripe.mockResolvedValue({})
    mockDeleteExport.mockResolvedValue(undefined)
  })

  it('marks pending exports failed without deleting S3 objects', async () => {
    const user = await createTestUser()
    const request = await accountDataRequests.createDataRequest(user.id)

    await deleteUserAndDrainForTest(user, user, cleanupDeps())

    await expect(getUserDataRequestStatusAndS3KeyForTest(request.id)).resolves.toEqual({
      status: 'failed',
      s3_key: null,
    })
    expect(mockDeleteExport).not.toHaveBeenCalled()
  })

  it('clears ready export S3 keys after durable object deletion', async () => {
    const user = await createTestUser()
    const request = await accountDataRequests.createDataRequest(user.id)
    expect(await accountDataRequests.markDataRequestProcessing(request.id)).toBe(true)
    const s3Key = `active-export-${Math.random().toString(36).slice(2, 10)}.zip`
    expect(
      await accountDataRequests.markDataRequestReady(
        request.id,
        s3Key,
        new Date(Date.now() + 60_000),
      ),
    ).toBe(true)

    await deleteUserAndDrainForTest(user, user, cleanupDeps())

    await expect(getUserDataRequestStatusAndS3KeyForTest(request.id)).resolves.toEqual({
      status: 'expired',
      s3_key: null,
    })
    expect(mockDeleteExport).toHaveBeenCalledWith([s3Key])
  })

  it('deletes S3 objects of ready exports whose deadline has already passed', async () => {
    const user = await createTestUser()
    const request = await accountDataRequests.createDataRequest(user.id)
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

    await deleteUserAndDrainForTest(user, user, cleanupDeps())

    await expect(getUserDataRequestStatusAndS3KeyForTest(request.id)).resolves.toEqual({
      status: 'expired',
      s3_key: null,
    })
    expect(mockDeleteExport).toHaveBeenCalledWith([s3Key])
  })

  it('deletes S3 objects of currently-active ready exports', async () => {
    const user = await createTestUser()
    const request = await accountDataRequests.createDataRequest(user.id)
    expect(await accountDataRequests.markDataRequestProcessing(request.id)).toBe(true)
    const s3Key = `active-export-${Math.random().toString(36).slice(2, 10)}.zip`
    expect(
      await accountDataRequests.markDataRequestReady(
        request.id,
        s3Key,
        new Date(Date.now() + 60_000),
      ),
    ).toBe(true)

    await deleteUserAndDrainForTest(user, user, cleanupDeps())

    await expect(getUserDataRequestStatusAndS3KeyForTest(request.id)).resolves.toEqual({
      status: 'expired',
      s3_key: null,
    })
    expect(mockDeleteExport).toHaveBeenCalledWith([s3Key])
  })
})
