import { randomUUID } from 'node:crypto'
import { v7 } from 'uuid'
import { describe, expect, it } from 'vitest'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  attemptDirectCopyrightKeyMutation,
  attemptYoungCopyrightKeyMutation,
  hasCopyrightSubmissionReplayIdentity,
  readCopyrightSubmissionRequestKeys,
  retainCopyrightSubmissionReplay,
  seedCopyrightSubmissionRequestKey,
} from '@voucha/test-helpers/entities/copyright-submission-key-retention'
import { cleanupCopyrightSubmissionKeys } from './cleanup-copyright-submission-keys.mts'

describe('copyright submission raw replay keys', () => {
  it('clears only a key older than 30 days and preserves its compact exact-replay identity', async () => {
    const now = new Date()
    const oldCase = await createRetentionMinimalCase({ claimant: true })
    const youngCase = await createRetentionMinimalCase({ claimant: true })
    const oldId = v7({ msecs: now.getTime() - 31 * 24 * 60 * 60 * 1_000 })
    const youngId = v7({ msecs: now.getTime() - 24 * 60 * 60 * 1_000 })
    const oldKey = randomUUID()
    const youngKey = randomUUID()
    const oldHash = Buffer.alloc(32, 2)
    await seedCopyrightSubmissionRequestKey({
      id: oldId,
      submissionId: oldCase.submissionId,
      requesterUserId: oldCase.claimantId,
      idempotencyKey: oldKey,
      requestSha256: oldHash,
    })
    await seedCopyrightSubmissionRequestKey({
      id: youngId,
      submissionId: youngCase.submissionId,
      requesterUserId: youngCase.claimantId,
      idempotencyKey: youngKey,
      requestSha256: Buffer.alloc(32, 3),
    })
    const identityHash = await retainCopyrightSubmissionReplay({
      requesterUserId: oldCase.claimantId!,
      idempotencyKey: oldKey,
      requestSha256: oldHash,
      submissionId: oldCase.submissionId,
      receivedAt: now,
    })

    await expect(attemptDirectCopyrightKeyMutation(oldId)).rejects.toThrow(
      /copyright legal records are immutable/,
    )
    await expect(attemptYoungCopyrightKeyMutation(youngId)).rejects.toThrow(
      /copyright legal records are immutable/,
    )

    await expect(
      cleanupCopyrightSubmissionKeys({ batchSize: 2, maxBatches: 1 }, now, [oldId, youngId]),
    ).resolves.toEqual({ scanned: 2, cleared: 1, hasMore: false })
    const rows = await readCopyrightSubmissionRequestKeys([oldId, youngId])
    expect(rows.find(row => row.id === oldId)?.idempotency_key).toBeNull()
    expect(rows.find(row => row.id === youngId)?.idempotency_key).toBe(youngKey)
    expect(await hasCopyrightSubmissionReplayIdentity(identityHash, oldKey)).toBe(true)
  })
})
