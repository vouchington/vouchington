import { afterAll, describe, expect, it } from 'vitest'
import {
  createTestMembershipProviderContext,
  deleteTestMembershipProviderContext,
  rejectTestGoogleRowsOnStripeContext,
  updateTestMembershipProviderContext,
} from '../../../test-helpers/entities/membership-provider-context-integrity.mts'
import { onGracefulShutdown } from '../index.mts'

describe('membership provider context integrity', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('keeps a referenced provider identity immutable', async () => {
    const contextId = await createTestMembershipProviderContext()
    await expect(updateTestMembershipProviderContext(contextId)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(deleteTestMembershipProviderContext(contextId)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('rejects Google tokens and acknowledgments on a Stripe context', async () => {
    const contextId = await createTestMembershipProviderContext()
    const invalidWrites = await rejectTestGoogleRowsOnStripeContext(contextId)
    await expect(invalidWrites.token()).rejects.toMatchObject({ code: '23514' })
    await expect(invalidWrites.acknowledgment()).rejects.toMatchObject({ code: '23514' })
  })
})
