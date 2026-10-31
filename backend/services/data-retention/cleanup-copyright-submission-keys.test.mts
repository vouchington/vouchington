import { createHash, randomUUID } from 'node:crypto'
import { v7 } from 'uuid'
import { describe, expect, it } from 'vitest'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  readCopyrightSubmissionKeyExpiry,
  seedCopyrightSubmissionKeyExpiry,
} from '@voucha/test-helpers/entities/copyright-submission-key-expiry'
import { cleanupCopyrightSubmissionKeys } from './cleanup-copyright-submission-keys.mts'

describe('copyright submission key expiry', () => {
  it('clears an old raw key once, keeps its replay digest, and leaves a young key', async () => {
    const now = new Date()
    const oldCase = await createRetentionMinimalCase({ claimant: true })
    const youngCase = await createRetentionMinimalCase({ claimant: true })
    const oldId = v7({ msecs: now.getTime() - 31 * 24 * 60 * 60 * 1_000 })
    const youngId = v7({ msecs: now.getTime() - 24 * 60 * 60 * 1_000 })
    const oldKey = randomUUID()
    const youngKey = randomUUID()
    await seedCopyrightSubmissionKeyExpiry({
      id: oldId,
      submissionId: oldCase.submissionId,
      requesterId: oldCase.claimantId!,
      key: oldKey,
    })
    await seedCopyrightSubmissionKeyExpiry({
      id: youngId,
      submissionId: youngCase.submissionId,
      requesterId: youngCase.claimantId!,
      key: youngKey,
    })

    const result = await cleanupCopyrightSubmissionKeys({ batchSize: 2, maxBatches: 1 }, now, [
      oldId,
      youngId,
    ])
    expect(result.cleared).toBe(1)
    expect(result.hasMore).toBe(false)
    const oldRow = await readCopyrightSubmissionKeyExpiry(oldId)
    expect(oldRow.idempotency_key).toBeNull()
    expect(oldRow.idempotency_key_sha256).toEqual(createHash('sha256').update(oldKey).digest())
    expect((await readCopyrightSubmissionKeyExpiry(youngId)).idempotency_key).toBe(youngKey)
    expect(
      (await cleanupCopyrightSubmissionKeys({ batchSize: 2, maxBatches: 1 }, now, [oldId, youngId]))
        .cleared,
    ).toBe(0)
  })
})
