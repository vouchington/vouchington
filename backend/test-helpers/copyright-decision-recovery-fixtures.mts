import { write } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { expect } from 'vitest'
import sql from 'sql-template-strings'
import { createTestUser } from './index.mts'
import { createCopyrightFormFixture } from './copyright-route-fixtures.mts'
import { createCopyrightFormIntake } from '../services/copyright-notices/form-intakes.mts'
import { createTestCopyrightFormIntakeReview } from './data-stores/psql/copyright-form-reviews.mts'
import { readCopyrightAssessmentRaceState } from './copyright-assessment-race-outcomes.mts'
import type { CopyrightSweepIdPage } from '../services/copyright-notices/sweep-id-pages.mts'

/** Durable accepted decisions precede recovery; no assessment writer runs as incidental setup. */
export async function createDecisionRecoveryCohort(count: number) {
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  const noticeIds: string[] = []
  const submissionIds: string[] = []
  for (let index = 0; index < count; index++) {
    const fixture = await createCopyrightFormFixture()
    const { intake } = await createCopyrightFormIntake({
      currentUser: fixture.claimant,
      requesterIdentity: `user:${fixture.claimant.id}`,
      idempotencyKey: crypto.randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: fixture.form.claimant_display_name,
        claimantContact: fixture.form.claimant_contact,
        claimantEmail: fixture.form.claimant_email,
        workDescription: fixture.form.work_description,
        goodFaithBelief: fixture.form.has_good_faith_belief,
        accuracyAuthorityUnderPenaltyOfPerjury:
          fixture.form.has_accuracy_authority_under_penalty_of_perjury,
        electronicSignature: fixture.form.electronic_signature,
        claimantTargets: fixture.form.targets.map(target => ({
          surfaceKind: 'post-image' as const,
          postId: target.post_id,
          imageId: target.image_id,
          hostedUseUrl: target.target_url,
        })),
      },
    })
    await createTestCopyrightFormIntakeReview({
      intakeId: intake.id,
      moderatorId: moderator.id,
      is_accepted: true,
    })
    noticeIds.push(intake.copyright_notice_id)
    submissionIds.push(intake.copyright_notice_submission_id)
  }
  return { moderator, noticeIds, submissionIds }
}

type Authority = {
  notice: string
  submission: string
  actor: string | null
  screening: string | null
  assessed_at: Date | null
  consistent: boolean
}
type Event = { notice: string; assessment: string; actor: string | null; source: string | null }

/** All owned legal stages, including current authority metadata and recovery-source audit. */
export async function readDecisionRecoveryState(noticeIds: string[]) {
  const [states, { rows: authority }, { rows: events }, { rows: clocks }] = await Promise.all([
    Promise.all(
      noticeIds.map(async notice => ({
        notice,
        state: await readCopyrightAssessmentRaceState(notice),
      })),
    ),
    write<Authority>(sql`/* readDecisionRecoveryState:authority */
      SELECT submission.copyright_notice_id AS notice, submission.id AS submission,
        submission.current_assessed_by_id AS actor, submission.current_assessment_form_screening_id AS screening,
        submission.current_assessed_at AS assessed_at,
        submission.current_assessed_by_id IS NOT DISTINCT FROM assessment.assessed_by_id AND
        submission.current_assessed_at IS NOT DISTINCT FROM assessment.assessed_at AND
        submission.current_assessment_form_screening_id IS NOT DISTINCT FROM assessment.copyright_notice_form_screening_id AS consistent
      FROM copyright_notice_submissions submission LEFT JOIN copyright_notice_submission_assessments assessment
        ON assessment.id = submission.current_assessment_identity_id
      WHERE submission.copyright_notice_id = ANY(${noticeIds}::uuid[]) ORDER BY submission.id`),
    write<Event>(sql`/* readDecisionRecoveryState:events */
      SELECT copyright_notice_id AS notice, copyright_notice_submission_assessment_identity_id AS assessment,
        changed_by_id AS actor, recovery_source AS source FROM copyright_notice_lifecycle_changes
      WHERE copyright_notice_id = ANY(${noticeIds}::uuid[]) AND change_type = 'submission_assessed'
      ORDER BY copyright_notice_submission_assessment_identity_id`),
    write<{ notice: string; clock: Date }>(sql`/* readDecisionRecoveryState:clocks */
      SELECT id AS notice, last_legal_activity_at AS clock FROM copyright_notices
      WHERE id = ANY(${noticeIds}::uuid[]) ORDER BY id`),
  ])
  return { states, authority, events, clocks }
}

type State = Awaited<ReturnType<typeof readDecisionRecoveryState>>

/** Exact assessment/pointer/event transition; every unrelated owned stage retains its before value. */
export function expectedDecisionRecoveryState(
  before: State,
  after: State,
  submissions: string[],
  actor: string,
  source: 'durable_decision' | null = 'durable_decision',
) {
  const ids = new Map(
    submissions.map(submission => {
      const owner = after.authority.find(row => row.submission === submission)?.notice
      return [
        submission,
        after.states
          .find(row => row.notice === owner)
          ?.state.pointers.find(row => row.id === submission)?.assessment ?? undefined,
      ]
    }),
  )
  const selectedNotices = before.authority.flatMap(row =>
    ids.has(row.submission) ? [row.notice] : [],
  )
  return {
    states: before.states.map(row => {
      const selected = row.state.pointers.filter(pointer => ids.has(pointer.id))
      const added = selected.map(pointer => ids.get(pointer.id))
      return {
        notice: row.notice,
        state: {
          ...row.state,
          assessments: [
            ...row.state.assessments,
            ...added.map(id => ({ id, supersedes: null, compliant: true })),
          ],
          identities: [...row.state.identities, ...added].toSorted((a, b) =>
            String(a).localeCompare(String(b)),
          ),
          pointers: row.state.pointers.map(pointer =>
            ids.has(pointer.id)
              ? { ...pointer, assessment: ids.get(pointer.id), compliant: true }
              : pointer,
          ),
          events: [...row.state.events, ...selected.map(() => 'submission_assessed')].toSorted(),
        },
      }
    }),
    authority: before.authority.map(row =>
      ids.has(row.submission)
        ? { ...row, actor, screening: null, assessed_at: expect.any(Date), consistent: true }
        : row,
    ),
    events: [
      ...before.events,
      ...before.authority.flatMap(row =>
        ids.has(row.submission)
          ? [
              {
                notice: row.notice,
                assessment: ids.get(row.submission),
                actor,
                source,
              },
            ]
          : [],
      ),
    ].toSorted((a, b) => String(a.assessment).localeCompare(String(b.assessment))),
    clocks: before.clocks.map(row =>
      selectedNotices.includes(row.notice) ? { ...row, clock: expect.any(Date) } : row,
    ),
  }
}

export function recoveredDecisionPage(id: string, hasMore: boolean) {
  return {
    status: 'fulfilled',
    value: {
      results: [id],
      page_info: {
        has_next_page: hasMore,
        start_cursor: encodeCursor({ id }),
        end_cursor: encodeCursor({ id }),
      },
    },
  }
}

export function decisionRecoveryOutcome(result: PromiseSettledResult<CopyrightSweepIdPage>) {
  if (result.status === 'fulfilled') return result
  const err = result.reason as { code?: string; status?: number }
  return { status: 'rejected', code: err.code, statusCode: err.status }
}

export const nativeDecisionRecoveryConflict = {
  status: 'rejected',
  code: '40001',
  statusCode: undefined,
}

export function assertDecisionRecoveryClocks(before: State, after: State) {
  expect(
    after.clocks.map((row, index) => row.clock.getTime() >= before.clocks[index]!.clock.getTime()),
  ).toEqual(before.clocks.map(() => true))
}
