import { describe, expect, it } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { createTestAppleRecoveryNotification } from '@voucha/test-helpers/apple-recovery-fixtures'
import { findRecoverableAppleNotificationJobs } from './notification-recovery.mts'

describe('Apple notification recovery', () => {
  it('finds bounded owned durable notification work after queue loss', async () => {
    const neighbor = await createTestAppleRecoveryNotification()
    const owned = await createTestAppleRecoveryNotification()
    const secondOwned = await createTestAppleRecoveryNotification()

    const recoverable = await findRecoverableAppleNotificationJobs({
      evidenceIds: [owned.evidenceId, secondOwned.evidenceId],
      batchSize: 1,
    })

    expect(recoverable.notifications).toEqual([
      {
        evidenceId: owned.evidenceId,
        providerLineageId: 'original-transaction-id',
        environment: 'test',
      },
    ])
    await expect(
      findRecoverableAppleNotificationJobs({
        evidenceIds: [secondOwned.evidenceId],
        batchSize: 1,
      }).then(page => page.notifications),
    ).resolves.toEqual([
      {
        evidenceId: secondOwned.evidenceId,
        providerLineageId: 'original-transaction-id',
        environment: 'test',
      },
    ])
    await expect(
      findRecoverableAppleNotificationJobs({ evidenceIds: [], batchSize: 1 }),
    ).resolves.toMatchObject({ notifications: [], hasMore: false, nextCursor: null, inspected: 0 })
    await expect(memberships.getJob(neighbor.jobId)).resolves.toBeNull()
  })
})
