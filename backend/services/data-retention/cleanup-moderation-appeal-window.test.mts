import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestModerationAppeal,
  insertTestUserWarning,
  resolveTestModerationAppeal,
} from '@voucha/test-helpers'
import {
  getModerationAppealById,
  getModerationAppealByIdFromPrimary,
} from '@services/moderation-appeals/get'
import { updateModerationAppealDraft } from '@services/moderation-appeals/update-appeal-draft'
import { approveModerationAppeal } from '@services/moderation-appeals/approve-appeal'
import { sendApprovedModerationAppealResolution } from '@services/moderation-appeals/send-appeal-resolution'
import { isModerationAppealVisibleToAppellant } from '@services/moderation-appeals/visibility'
import { testModerationRetentionWrite } from '@voucha/test-helpers/entities/moderation-retention'
import { deleteExpiredModerationHistory } from './cleanup-moderation-delete-history.mts'

describe('appeal cleanup window', () => {
  it('keeps both exact history cutoffs and expires the earlier delivered resolution', async () => {
    const now = new Date('2026-03-31T12:34:56.789Z')
    const cutoff = new Date('2024-03-31T12:34:56.789Z')
    const expiredAt = new Date(cutoff.getTime() - 1)
    const caller = await createTestUser()
    const warnings = await Promise.all(
      [0, 1, 2].map(() => insertTestUserWarning({ userId: caller.id, issuedById: caller.id })),
    )
    const appeals = await Promise.all(
      warnings.map(warning =>
        insertTestModerationAppeal({ appellantId: caller.id, userWarningId: warning.id }),
      ),
    )
    await resolveTestModerationAppeal({
      appealId: appeals[0]!.id,
      resolvedAt: cutoff,
      sentAt: expiredAt,
      resolutionAction: 'deny',
    })
    await resolveTestModerationAppeal({
      appealId: appeals[1]!.id,
      resolvedAt: expiredAt,
      sentAt: expiredAt,
      resolutionAction: 'deny',
    })
    await resolveTestModerationAppeal({
      appealId: appeals[2]!.id,
      resolvedAt: expiredAt,
      sentAt: cutoff,
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
    expect(await getModerationAppealById(appeals[2]!.id)).not.toBeNull()
  })

  it('preserves a late public response and its lifecycle event after the resolution expires', async () => {
    const [staff, member] = await Promise.all([createTestUser(), createTestUser()])
    const warning = await insertTestUserWarning({ userId: member.id, issuedById: staff.id })
    const appeal = await insertTestModerationAppeal({
      appellantId: member.id,
      userWarningId: warning.id,
    })
    await updateModerationAppealDraft(staff.id, appeal.id, {
      publicResponse: 'Your appeal was reviewed.',
    })
    const approved = await approveModerationAppeal(staff.id, appeal.id)
    const expiredAt = new Date('2000-01-01T00:00:00.000Z')
    await resolveTestModerationAppeal({
      appealId: appeal.id,
      resolvedAt: expiredAt,
      resolutionAction: 'deny',
    })

    await deleteExpiredModerationHistory(
      'appeals',
      testModerationRetentionWrite,
      [appeal.id],
      new Date(),
    )
    expect(await getModerationAppealByIdFromPrimary(appeal.id)).toMatchObject({
      resolved_at: expiredAt,
      sent_at: null,
      latest_lifecycle_change_id: approved.latest_lifecycle_change_id,
    })
    const sent = await sendApprovedModerationAppealResolution(staff.id, appeal.id)
    expect(sent.sent_at).not.toBeNull()
    expect(sent.latest_lifecycle_change_id).not.toBeNull()
    expect(sent.latest_lifecycle_change_id).not.toBe(approved.latest_lifecycle_change_id)

    await deleteExpiredModerationHistory(
      'appeals',
      testModerationRetentionWrite,
      [appeal.id],
      new Date(),
    )
    expect(await getModerationAppealByIdFromPrimary(appeal.id)).toMatchObject({
      resolved_at: expiredAt,
      sent_at: sent.sent_at,
      latest_lifecycle_change_id: sent.latest_lifecycle_change_id,
    })
  })
})
