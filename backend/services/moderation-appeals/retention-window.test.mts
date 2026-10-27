import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestModerationAppeal,
  insertTestUserWarning,
  resolveTestModerationAppeal,
} from '@voucha/test-helpers'
import { listModerationAppeals } from './get.mts'
import { isModerationAppealVisibleToAppellant } from './visibility.mts'

describe('member appeal list retention', () => {
  it('uses the resolved-history window for member lists while keeping pending appeals visible', async () => {
    const caller = await createTestUser()
    const warnings = await Promise.all(
      [0, 1, 2].map(() => insertTestUserWarning({ userId: caller.id, issuedById: caller.id })),
    )
    const appeals = await Promise.all(
      warnings.map(warning =>
        insertTestModerationAppeal({ appellantId: caller.id, userWarningId: warning.id }),
      ),
    )
    const now = new Date()
    const expiredAt = new Date(now)
    expiredAt.setUTCFullYear(expiredAt.getUTCFullYear() - 3)
    const currentAt = new Date(now)
    currentAt.setUTCFullYear(currentAt.getUTCFullYear() - 1)
    await resolveTestModerationAppeal({
      appealId: appeals[0]!.id,
      resolvedAt: expiredAt,
      resolutionAction: 'deny',
    })
    await resolveTestModerationAppeal({
      appealId: appeals[1]!.id,
      resolvedAt: currentAt,
      resolutionAction: 'deny',
    })
    const resolved = await listModerationAppeals({
      appellantUserId: caller.id,
      status: 'dismissed',
    })
    expect(resolved.appeals.map(appeal => appeal.id)).toEqual([appeals[1]!.id])
    expect(isModerationAppealVisibleToAppellant({ resolved_at: expiredAt }, now)).toBe(false)
    expect(isModerationAppealVisibleToAppellant({ resolved_at: currentAt }, now)).toBe(true)
    const pending = await listModerationAppeals({ appellantUserId: caller.id })
    expect(pending.appeals.map(appeal => appeal.id)).toEqual([appeals[2]!.id])
  })
})
