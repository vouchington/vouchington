import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { enqueueBulkProcessMembershipVerifications } from '@queues/memberships/enqueues'
import { memberships } from '@queues/memberships/queues'
import {
  createMembershipVerification,
  findRecoverableMembershipVerificationIds,
} from '@services/memberships'
import { createTestUser } from '@voucha/test-helpers'
import { recoverMembershipVerifications } from './verification-recovery.mts'

// This file exercises the real Valkey transport. The passthrough is required because the dedicated
// backend-real-glide-mq project routes only .real-glide.mock.test.mts files.
vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

describe('membership verification recovery with real GlideMQ', () => {
  it('restores a lost stable job from PostgreSQL and keeps concurrent recovery deduplicated', async () => {
    const user = await createTestUser()
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'apple_app_store',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { signed_transaction: randomUUID() },
    })
    const jobId = `membership-verification__${verification.id}`

    try {
      const initialJob = await memberships.getJob(jobId)
      if (!initialJob) throw new Error('Expected the verification enqueue to create its stable job')

      // Simulate Valkey losing the accepted job while its committed verification remains due.
      await initialJob.remove()
      await expect(memberships.getJob(jobId)).resolves.toBeNull()

      const findOnlyThisVerification = async () =>
        (await findRecoverableMembershipVerificationIds()).filter(id => id === verification.id)

      const dependencies = {
        findRecoverableMembershipVerificationIds: findOnlyThisVerification,
        enqueueBulkProcessMembershipVerifications,
      }
      await expect(recoverMembershipVerifications(dependencies)).resolves.toEqual({ enqueued: 1 })

      await Promise.all([
        recoverMembershipVerifications(dependencies),
        recoverMembershipVerifications(dependencies),
      ])

      await expect(memberships.getJob(jobId)).resolves.toMatchObject({
        id: jobId,
        name: 'processMembershipVerification',
        data: { verificationId: verification.id },
        opts: { deduplication: { id: jobId, mode: 'simple' } },
      })
    } finally {
      const job = await memberships.getJob(jobId)
      await job?.remove()
    }
  })
})
