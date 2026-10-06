import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getCopyrightStaffEmailIntake } from '@services/copyright-notices'
import { createParsedCopyrightEmailIntake } from '@services/copyright-notices/email-intake-test-fixtures'
import { searchCopyrightStaffEmailIntakes } from '@services/copyright-notices/read-models-staff-email-intakes'
import { listCopyrightStaffQueue } from '@services/copyright-notices/read-models-staff'
import { seedCopyright } from './copyright.mts'

describe('seedCopyright', () => {
  it('fills both staff queues with every review state and adds nothing when run again', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const foreign = await createParsedCopyrightEmailIntake(new Date())
    const first = await seedCopyright()
    const second = await seedCopyright()
    expect(second).toEqual(first)

    // The email queue is oldest first: new notice, its reply, a failed parse, no parse row, then
    // the message SES flagged for malware.
    const { intakes, hasNextPage: emailHasNextPage } = await searchCopyrightStaffEmailIntakes(
      moderator,
      { limit: first.emailIntakeIds.length, intakeIds: first.emailIntakeIds },
    )
    expect(emailHasNextPage).toBe(false)
    expect(intakes.map(intake => intake.id)).toEqual(first.emailIntakeIds)
    expect(intakes.map(intake => intake.id)).not.toContain(foreign.id)
    expect(
      intakes.map(({ parse_status, review_path, recommendation_id, linked_notice_id }) => ({
        parse_status,
        review_path,
        recommendation_id,
        linked_notice_id,
      })),
    ).toEqual([
      {
        parse_status: 'succeeded',
        review_path: 'initial',
        recommendation_id: null,
        linked_notice_id: null,
      },
      {
        parse_status: 'succeeded',
        review_path: 'unresolved_thread',
        recommendation_id: null,
        linked_notice_id: null,
      },
      {
        parse_status: 'failed',
        review_path: 'initial',
        recommendation_id: null,
        linked_notice_id: null,
      },
      {
        parse_status: 'unparsed',
        review_path: 'initial',
        recommendation_id: null,
        linked_notice_id: null,
      },
      {
        parse_status: 'succeeded',
        review_path: 'initial',
        recommendation_id: null,
        linked_notice_id: null,
      },
    ])

    // Only the malware-flagged message has its original withheld; the others offer the download.
    const details = await Promise.all(
      first.emailIntakeIds.map(id => getCopyrightStaffEmailIntake(id, moderator)),
    )
    expect(details.map(detail => detail?.ses_verdicts.virus)).toEqual([
      'pass',
      'pass',
      'pass',
      'pass',
      'fail',
    ])
    expect(details.map(detail => detail?.raw_email.download_url === null)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ])

    // The overdue-deadline case outranks the case that has only waited on intake review.
    const noticeIds = [first.deadlineCase.noticeId, first.intakeReviewCase.noticeId]
    const { cases, hasNextPage } = await listCopyrightStaffQueue(moderator, {
      limit: noticeIds.length,
      noticeIds,
    })
    expect(hasNextPage).toBe(false)
    expect(cases.map(queued => queued.id)).toEqual([
      first.deadlineCase.noticeId,
      first.intakeReviewCase.noticeId,
    ])
    const [deadlineCase, intakeReviewCase] = cases
    expect(deadlineCase).toMatchObject({
      reasons: ['deadline_due'],
      claimant: { display_name: 'Priya Natarajan' },
      form_review: { review: { is_accepted: true } },
      counter_notices: [],
    })
    expect(deadlineCase!.next_deadline!.escalation_at.getTime()).toBeLessThan(Date.now())
    expect(deadlineCase!.next_deadline!.restoration_deadline_at.getTime()).toBeGreaterThan(
      Date.now(),
    )
    expect(deadlineCase!.waiting_since).toEqual(deadlineCase!.next_deadline!.escalation_at)

    // The guidance panel decrypts: a gap, a risk note and a suggested action reach the moderator.
    expect(intakeReviewCase).toMatchObject({
      reasons: ['form_intake_review'],
      next_deadline: null,
      claimant: { display_name: 'Marcus Lee', contact: expect.stringContaining('lee-studio') },
      targets: [
        expect.objectContaining({ hosted_use_url: expect.stringContaining('/discussion/') }),
      ],
      form_review: {
        review: null,
        screening: {
          state: 'completed',
          recommendation: 'not_obviously_invalid',
          guidance: {
            suggested_action: 'request_information',
            risk_notes: [expect.objectContaining({ kind: 'possible_fair_use' })],
            elements: expect.arrayContaining([
              { element: 'work_identification', status: 'unclear', gap: expect.any(String) },
            ]),
          },
        },
      },
    })
  })
})
