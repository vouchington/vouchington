import type { Job } from 'glide-mq'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { createMembershipVerification } from '@services/memberships'
import { createTestUser } from '@voucha/test-helpers'
import { completeMembershipVerification } from '@voucha/test-helpers/data-stores/psql/membership-verifications'
import { recoverMembershipVerifications } from './verification-recovery.mts'
import type { RecoverMembershipVerificationsData } from '@queues/memberships/types'

// The real transport project routes this filename; the package stays unmocked.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('membership verification recovery with real PostgreSQL and GlideMQ', () => {
  it('persists the initial upper bound when the resume range is already drained', async () => {
    const user = await createTestUser()
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'apple_app_store',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { signed_transaction: randomUUID() },
    })
    // A cursor need not retain its source row. This upper UUIDv7 cursor keeps the empty
    // resumed range isolated from other tests' pending verifications on the shared database.
    const after = 'ffffffff-ffff-7fff-bfff-ffffffffffff'
    const job = await memberships.add(
      'recoverMembershipVerifications',
      { after },
      {
        jobId: `test-verification-bound-${randomUUID()}`,
        priority: 100,
      },
    )
    if (!job) throw new Error('Expected a real dispatcher job')
    try {
      await expect(
        recoverMembershipVerifications(job as Job<RecoverMembershipVerificationsData>),
      ).resolves.toEqual({ enqueued: 0 })
      const persisted = (await memberships.getJob(
        job.id,
      )) as Job<RecoverMembershipVerificationsData> | null
      expect(persisted?.data).toMatchObject({
        after,
        through: expect.any(String),
        dispatchReceipt: { result: { enqueued: 0 } },
      })
      const through = persisted?.data.through
      if (!through) throw new Error('Expected a durable recovery upper bound')
      expect(through.localeCompare(verification.id)).toBeGreaterThanOrEqual(0)
      await expect(
        recoverMembershipVerifications(job as Job<RecoverMembershipVerificationsData>),
      ).resolves.toEqual({ enqueued: 0 })
      const replay = (await memberships.getJob(
        job.id,
      )) as Job<RecoverMembershipVerificationsData> | null
      expect(replay?.data.through).toBe(through)
    } finally {
      await completeMembershipVerification(verification.id)
      await (await memberships.getJob(verification.id))?.remove()
      await (await memberships.getJob(job.id))?.remove()
    }
  })

  it('restores missed admission, deduplicates concurrent sweeps, and converges after outcome', async () => {
    const user = await createTestUser()
    const submit = () =>
      createMembershipVerification({
        userId: user.id,
        provider: 'apple_app_store',
        purchaseIntentId: null,
        idempotencyKey: randomUUID(),
        evidence: { signed_transaction: randomUUID() },
      })
    const boundary = await submit()
    const verification = await submit()
    const pages: string[] = []
    const sweep = async () => {
      const job = await memberships.add(
        'recoverMembershipVerifications',
        {
          after: boundary.id,
          through: verification.id,
        },
        { jobId: `test-verification-recovery-${randomUUID()}`, priority: 100 },
      )
      if (!job) throw new Error('Expected a real dispatcher job')
      pages.push(job.id)
      return recoverMembershipVerifications(job as Job<RecoverMembershipVerificationsData>)
    }
    try {
      // Accepted queue state disappears after the PostgreSQL verification has committed.
      await (await memberships.getJob(verification.id))?.remove()
      await expect(memberships.getJob(verification.id)).resolves.toBeNull()
      await expect(sweep()).resolves.toMatchObject({ enqueued: expect.any(Number) })
      await Promise.all([sweep(), sweep()])
      await expect(memberships.getJob(verification.id)).resolves.toMatchObject({
        id: verification.id,
        name: 'processMembershipVerification',
        data: { verificationId: verification.id },
        opts: {
          removeOnComplete: true,
          removeOnFail: true,
          ordering: { key: 'memberships:verification', concurrency: expect.any(Number) },
        },
      })
      await completeMembershipVerification(verification.id)
      await (await memberships.getJob(verification.id))?.remove()
      await expect(sweep()).resolves.toEqual({ enqueued: 0 })
      await expect(memberships.getJob(verification.id)).resolves.toBeNull()
    } finally {
      for (const id of [...pages, boundary.id, verification.id]) {
        await (await memberships.getJob(id))?.remove()
      }
    }
  })
})
