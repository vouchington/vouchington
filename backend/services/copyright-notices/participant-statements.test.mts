import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createCommittedCopyrightStatementScene } from '@voucha/test-helpers/copyright-statement-scene'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getCopyrightParticipantNoticeDetail } from './read-models-participant.mts'

describe('private participant statement projection', () => {
  useCopyrightIntakeEnvironment()
  it('shows only the viewer statements, and omits staff', async () => {
    const [poster, claimant, other, moderator] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const { notice } = await createCommittedCopyrightStatementScene({ poster, claimant })
    const caseId = notice.intake.copyright_notice_id
    expect((await getCopyrightParticipantNoticeDetail(caseId, poster))?.statements).toEqual([
      expect.objectContaining({
        delivery_kind: 'poster_restriction_notice',
        sent_at: null,
        text: expect.stringContaining('worldwide'),
      }),
    ])
    expect((await getCopyrightParticipantNoticeDetail(caseId, claimant))?.statements).toEqual([
      expect.objectContaining({ delivery_kind: 'claimant_decision_notice' }),
    ])
    expect(await getCopyrightParticipantNoticeDetail(caseId, other)).toBeNull()
    expect((await getCopyrightParticipantNoticeDetail(caseId, moderator))?.statements).toEqual([])
  })
  it('never opens an unaccepted notice case for its notifier', async () => {
    const claimant = await createTestUser()
    const { notice } = await createCommittedCopyrightStatementScene(
      { claimant },
      { accepted: false },
    )
    expect(
      await getCopyrightParticipantNoticeDetail(notice.intake.copyright_notice_id, claimant),
    ).toBeNull()
  })
  it('includes both roles addressed to a claimant who also owns the reported post', async () => {
    const participant = await createTestUser()
    const { notice } = await createCommittedCopyrightStatementScene({
      claimant: participant,
      poster: participant,
    })
    const detail = await getCopyrightParticipantNoticeDetail(
      notice.intake.copyright_notice_id,
      participant,
    )
    expect(detail?.viewer_role).toBe('claimant')
    expect(detail?.statements.map(row => row.delivery_kind).toSorted()).toEqual([
      'claimant_decision_notice',
      'poster_restriction_notice',
    ])
    expect(
      await getCopyrightParticipantNoticeDetail(
        notice.intake.copyright_notice_id,
        await createTestUser(),
      ),
    ).toBeNull()
  })
})
