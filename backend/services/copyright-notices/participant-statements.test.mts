import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  eraseTestCopyrightStatementBody,
  readTestCopyrightStatementIntents,
} from '@voucha/test-helpers/services/copyright-notices/statement-notices'
import { reviewCopyrightFormIntake } from './form-reviews.mts'
import { getCopyrightParticipantNoticeDetail } from './read-models.mts'

describe('private participant statement projection', () => {
  useCopyrightIntakeEnvironment()
  it('shows only the viewer statements, omits staff and skips erased bodies', async () => {
    const [poster, claimant, other, moderator] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const notice = await createSignedInCopyrightForm(1, { poster, claimant })
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: moderator,
      accepted: true,
      rationale: 'Complete notice.',
    })
    const caseId = notice.intake.copyright_notice_id
    expect((await getCopyrightParticipantNoticeDetail(caseId, poster))?.statements).toEqual([
      expect.objectContaining({
        delivery_kind: 'poster_restriction_notice',
        sent_at: null,
        text: expect.stringContaining('globally'),
      }),
    ])
    expect((await getCopyrightParticipantNoticeDetail(caseId, claimant))?.statements).toEqual([
      expect.objectContaining({ delivery_kind: 'claimant_decision_notice' }),
    ])
    expect(await getCopyrightParticipantNoticeDetail(caseId, other)).toBeNull()
    expect((await getCopyrightParticipantNoticeDetail(caseId, moderator))?.statements).toEqual([])
    const email = (await readTestCopyrightStatementIntents(caseId)).find(
      row => row.recipient_role === 'poster' && row.channel === 'email',
    )!
    await eraseTestCopyrightStatementBody(email.id)
    expect((await getCopyrightParticipantNoticeDetail(caseId, poster))?.statements).toEqual([])
  })
  it('never opens an unaccepted notice case for its notifier', async () => {
    const claimant = await createTestUser()
    const notice = await createSignedInCopyrightForm(1, { claimant })
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: await createTestUser({ extraRoles: ['moderator'] }),
      accepted: false,
      rationale: 'Incomplete notice.',
    })
    expect(
      await getCopyrightParticipantNoticeDetail(notice.intake.copyright_notice_id, claimant),
    ).toBeNull()
  })
})
