import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

/** Keep native primitive failures distinct from the service's exact mapped conflict. */
export function copyrightRaceResult(result: PromiseSettledResult<unknown>) {
  if (result.status === 'fulfilled') {
    const value = result.value as {
      id: string
      copyright_notice_target_id?: string
      authorizing_assessment_id?: string
      imposed_by_id?: string | null
      human_review_action?: string | null
      human_reviewed_by_id?: string | null
    }
    return {
      status: 'fulfilled',
      id: value.id,
      ...(value.copyright_notice_target_id
        ? {
            target: value.copyright_notice_target_id,
            assessment: value.authorizing_assessment_id,
            imposedBy: value.imposed_by_id,
            review: value.human_review_action,
            reviewer: value.human_reviewed_by_id,
          }
        : {}),
    }
  }
  const error = result.reason as {
    status?: number
    code?: string
    message?: string
    cause?: { code?: string }
  }
  if (error.code === '40001')
    return { status: 'rejected', code: error.code, statusCode: error.status }
  return {
    status: 'rejected',
    statusCode: error.status,
    code: error.code,
    message: error.message,
    causeCode: error.cause?.code,
  }
}

export const assessmentSerializationConflict = {
  status: 'rejected',
  statusCode: 409,
  code: 'CONFLICT',
  message: 'Conflicting copyright assessment',
  causeCode: '40001',
}
export const nativeCopyrightSerializationConflict = {
  status: 'rejected',
  code: '40001',
  statusCode: undefined,
}

/** Authoritative projection of all legal stages these races can write, including identity rows. */
export async function readCopyrightAssessmentRaceState(noticeId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  if (!aggregate) throw new Error('Owned copyright notice disappeared')
  const { rows } = await write<{ identities: string[]; incidents: number; staydown: number }>(sql`
    /* readCopyrightAssessmentRaceState */
    SELECT ARRAY(SELECT id::text FROM copyright_notice_submission_assessment_identities
      WHERE copyright_notice_id = ${noticeId} ORDER BY id) AS identities,
      (SELECT count(*)::int FROM copyright_repeat_infringer_incidents WHERE copyright_notice_id = ${noticeId}) AS incidents,
      (SELECT count(*)::int FROM copyright_staydown_entries entry
       JOIN copyright_restrictions restriction ON restriction.id = entry.copyright_restriction_id
       JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
       WHERE target.copyright_notice_id = ${noticeId}) AS staydown`)
  const { rows: pointers } = await write<{
    id: string
    assessment: string | null
    compliant: boolean | null
  }>(sql`/* readCopyrightAssessmentRaceState:pointers */
    SELECT id, current_assessment_identity_id AS assessment,
      current_assessment_is_substantially_compliant AS compliant
    FROM copyright_notice_submissions WHERE copyright_notice_id = ${noticeId} ORDER BY id`)
  return {
    accepted: aggregate.notice.accepted_at !== null,
    provisional: aggregate.notice.provisional_withholding_at !== null,
    assessments: aggregate.assessments.map(row => ({
      id: row.id,
      supersedes: row.supersedes_assessment_id,
      compliant: row.is_substantially_compliant,
    })),
    identities: rows[0]!.identities,
    pointers,
    restrictions: aggregate.restrictions.map(row => ({
      id: row.id,
      target: row.copyright_notice_target_id,
      assessment: row.authorizing_assessment_id,
      lifted: row.lifted_at,
      review: row.human_review_action,
      reviewer: row.human_reviewed_by_id,
    })),
    actions: aggregate.actionIntents.map(row => ({
      id: row.id,
      restriction: row.copyright_restriction_id,
      deadline: row.copyright_notice_deadline_id,
      revision: row.expected_placement_revision,
      action: row.action,
      state: row.state,
    })),
    events: aggregate.lifecycleEvents.map(row => row.change_type).toSorted(),
    deliveries: aggregate.deliveryIntents
      .map(row => `${row.delivery_kind}:${row.channel}:${row.recipient_user_id}`)
      .toSorted(),
    correspondence: aggregate.correspondence.map(row => row.correspondence_kind).toSorted(),
    incidents: rows[0]!.incidents,
    staydown: rows[0]!.staydown,
    deadlines: aggregate.deadlines,
    targets: aggregate.targets,
  }
}

/** Expected complete restriction transaction for one public post image and an anonymous claimant. */
export function copyrightRestrictedRaceState(
  before: Awaited<ReturnType<typeof readCopyrightAssessmentRaceState>>,
  input: { assessmentId: string; targetId: string; imposedById: string | null },
  restrictionId: string | undefined,
  posterId: string,
  revision: number,
  staydown: boolean,
) {
  return {
    ...before,
    accepted: true,
    provisional: true,
    restrictions: [
      {
        id: restrictionId,
        target: input.targetId,
        assessment: input.assessmentId,
        lifted: null,
        review: 'confirm',
        reviewer: input.imposedById,
      },
    ],
    actions: [
      {
        id: expect.any(String),
        restriction: restrictionId,
        deadline: null,
        revision,
        action: 'withhold',
        state: 'pending',
      },
    ],
    events: [...before.events, 'provisional_restriction_imposed'].toSorted(),
    deliveries: [
      ...before.deliveries,
      `poster_restriction_notice:email:${posterId}`,
      `poster_restriction_notice:in_app:${posterId}`,
    ].toSorted(),
    correspondence: [...before.correspondence, 'decision_notice', 'restriction_notice'].toSorted(),
    incidents: 1,
    staydown: staydown ? 1 : 0,
  }
}

export function copyrightSupersededRaceState(
  before: Awaited<ReturnType<typeof readCopyrightAssessmentRaceState>>,
  submissionId: string,
  originalId: string,
  supersedingId: string | undefined,
) {
  return {
    ...before,
    assessments: [
      ...before.assessments,
      { id: supersedingId, supersedes: originalId, compliant: true },
    ],
    identities: [...before.identities, supersedingId],
    pointers: [{ id: submissionId, assessment: supersedingId, compliant: true }],
    events: [...before.events, 'submission_assessed'].toSorted(),
  }
}
