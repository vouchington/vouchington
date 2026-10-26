import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestModerationAppeal,
  insertTestUserWarning,
  resolveTestModerationAppeal,
} from '@voucha/test-helpers'
import { getModerationAppealById } from '@services/moderation-appeals/get'
import { isModerationAppealVisibleToAppellant } from '@services/moderation-appeals/visibility'
import { testModerationRetentionWrite } from '@voucha/test-helpers/entities/moderation-retention'
import { deleteExpiredModerationHistory } from './cleanup-moderation-delete-history.mts'

describe('appeal cleanup window', () => {
  it('keeps the exact member visibility boundary and expires only earlier resolved history', async () => {
    const now = new Date('2026-03-31T12:34:56.789Z')
    const cutoff = new Date('2024-03-31T12:34:56.789Z')
    const caller = await createTestUser()
    const warnings = await Promise.all(
      [0, 1].map(() => insertTestUserWarning({ userId: caller.id, issuedById: caller.id })),
    )
    const appeals = await Promise.all(
      warnings.map(warning =>
        insertTestModerationAppeal({ appellantId: caller.id, userWarningId: warning.id }),
      ),
    )
    await resolveTestModerationAppeal({
      appealId: appeals[0]!.id,
      resolvedAt: cutoff,
      resolutionAction: 'deny',
    })
    await resolveTestModerationAppeal({
      appealId: appeals[1]!.id,
      resolvedAt: new Date(cutoff.getTime() - 1),
      resolutionAction: 'deny',
    })
    expect(
      await deleteExpiredModerationHistory(
        'appeals',
        testModerationRetentionWrite,
        appeals.map(appeal => appeal.id),
        now,
      ),
    ).toBe(1)
    const survivor = await getModerationAppealById(appeals[0]!.id)
    expect(survivor).not.toBeNull()
    expect(isModerationAppealVisibleToAppellant(survivor!, now)).toBe(true)
    expect(await getModerationAppealById(appeals[1]!.id)).toBeNull()
  })
})
