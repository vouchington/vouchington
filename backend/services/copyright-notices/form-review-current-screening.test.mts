import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { eraseTestCopyrightFormRequester } from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'
import {
  createClearScreenedForm,
  isTestCopyrightStaffCaseQueued,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { reviewCopyrightFormIntake } from './form-reviews.mts'
import { appendCopyrightFormScreening } from './form-screenings.mts'
import {
  startCopyrightFormScreening,
  failCopyrightFormScreening,
} from './form-screening-executions.mts'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('human form review with changing screening authority', () => {
  it('allows human approval of a completed-clear intake whose requester was erased', async () => {
    const [{ notice }, user] = await Promise.all([createClearScreenedForm(), createTestUser()])
    await eraseTestCopyrightFormRequester(notice.intake.id)
    await expect(
      isTestCopyrightStaffCaseQueued(notice.intake.copyright_notice_id, {
        ...user,
        roles: ['moderator'],
      }),
    ).resolves.toBe(true)
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: { ...user, roles: ['moderator'] },
      is_accepted: true,
      rationale: 'Human review of retained statutory evidence.',
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.assessments.at(-1)).toMatchObject({
      copyright_notice_form_screening_id: null,
      assessed_by_id: user.id,
      is_substantially_compliant: true,
    })
  })

  it('replays durable human approval after failed screening becomes clear and rejects an opposite decision', async () => {
    const [{ notice }, user] = await Promise.all([createClearScreenedForm(), createTestUser()])
    await failCopyrightFormScreening(await startCopyrightFormScreening(notice.intake.id))
    const input = {
      intakeId: notice.intake.id,
      currentUser: { ...user, roles: ['moderator'] },
      is_accepted: true,
      rationale: 'Human statutory review.',
    }
    await reviewCopyrightFormIntake(input)
    const before = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    await appendCopyrightFormScreening({
      intakeId: notice.intake.id,
      inputSha256: Buffer.alloc(32, 77),
      recommendation: 'not_obviously_invalid',
      rationale: 'Current clear recommendation.',
      guidance: testCopyrightFormGuidance,
      promptVersion: 'copyright-form-screening-v2',
      model: 'test-model',
    })
    await expect(reviewCopyrightFormIntake(input)).resolves.toMatchObject({ is_accepted: true })
    const after = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(after?.assessments).toEqual(before?.assessments)
    await expect(reviewCopyrightFormIntake({ ...input, is_accepted: false })).rejects.toMatchObject(
      {
        status: 409,
      },
    )
  })
})
