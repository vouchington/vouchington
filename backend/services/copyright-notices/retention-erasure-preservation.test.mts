import { describe, expect, it } from 'vitest'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  beginRetentionPartyLocks,
  canLockAccountNow,
} from '@voucha/test-helpers/services/copyright-notices/retention-preservation-holds'

describe('lockCopyrightRetentionCase', () => {
  it('holds the placement lock of the poster and the claimant until the erasure commits', async () => {
    const entry = await createRetentionMinimalCase({ claimant: true })
    const claimantId = entry.claimantId!

    await using erasure = await beginRetentionPartyLocks(entry.noticeId)

    await expect(canLockAccountNow(entry.posterId)).resolves.toBe(false)
    await expect(canLockAccountNow(claimantId)).resolves.toBe(false)
    await expect(canLockAccountNow(entry.moderator.id)).resolves.toBe(true)

    await erasure.commit()

    await expect(canLockAccountNow(entry.posterId)).resolves.toBe(true)
    await expect(canLockAccountNow(claimantId)).resolves.toBe(true)
  })
})
