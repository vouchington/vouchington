import { readCopyrightIntakeRetentionState } from './copyright-email-retention-state.mts'
import { readCopyrightThreadReferenceState } from './copyright-operational-email-retention.mts'
import { expect } from 'vitest'
import type { PrivateUser } from '../services/users/types.mts'
import { associateCopyrightEmailIntakeWithNotice } from '../services/copyright-notices/email-manual-association.mts'
import { readCopyrightEmailIntakeNoticeLinks } from './data-stores/psql/copyright-email-intakes.mts'
import {
  readCopyrightEmailManualAssociationEvent,
  readCopyrightEmailManualAssociationReview,
} from './copyright-email-manual-association.mts'
import {
  readCopyrightAssessmentRaceState,
  copyrightRaceResult,
} from './copyright-assessment-race-outcomes.mts'
import { readCopyrightCaseLifecycleClock } from './copyright-lifecycle-clock.mts'

export async function readOwnedCopyrightManualState(intakeId: string, noticeId: string) {
  return {
    intake: await readCopyrightIntakeRetentionState(intakeId),
    references: await readCopyrightThreadReferenceState(intakeId),
    links: await readCopyrightEmailIntakeNoticeLinks(intakeId),
    reviews: await readCopyrightEmailManualAssociationReview(intakeId),
    audit: await readCopyrightEmailManualAssociationEvent(intakeId),
    legal: await readCopyrightAssessmentRaceState(noticeId),
    clock: await readCopyrightCaseLifecycleClock(noticeId),
  }
}

/** A public mutation succeeds wholly or returns the exact native-backed conflict with no facts. */
export async function assertOwnedCopyrightManualAssociation(
  currentUser: PrivateUser,
  intakeId: string,
  noticeId: string,
) {
  const before = await readOwnedCopyrightManualState(intakeId, noticeId)
  const [outcome] = await Promise.allSettled([
    associateCopyrightEmailIntakeWithNotice(currentUser, intakeId, noticeId),
  ])
  expect([
    {
      outcome: {
        status: 'fulfilled',
        value: { copyright_notice: { id: noticeId }, copyright_email_intake: { id: intakeId } },
      },
      state: {
        ...before,
        links: [{ copyright_notice_id: noticeId, link_kind: 'thread' }],
        reviews: [{ copyright_notice_id: noticeId, action: 'pending' }],
        audit: [
          {
            copyright_notice_id: noticeId,
            changed_by_id: currentUser.id,
            copyright_notice_email_intake_id: intakeId,
          },
        ],
        legal: {
          ...before.legal,
          events: [...before.legal.events, 'email_intake_manually_associated'].toSorted(),
        },
        clock: expect.any(Date),
      },
    },
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: 'copyright_email_thread_changed',
        message: 'Copyright email thread changed; retry staff approval',
        causeCode: '40001',
      },
      state: before,
    },
  ]).toContainEqual({
    outcome: outcome!.status === 'fulfilled' ? outcome : copyrightRaceResult(outcome!),
    state: await readOwnedCopyrightManualState(intakeId, noticeId),
  })
}
