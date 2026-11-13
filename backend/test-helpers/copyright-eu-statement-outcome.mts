import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { PrivateUser } from '../services/users/types.mts'
import { recordEuCopyrightStatementOfReasons } from '../services/copyright-notices/eu-reasons.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

/** One real staff decision: its identity, current authority, notices and clock are one atomic stage. */
export async function assertEuStaffStatementOutcome(
  staff: PrivateUser,
  claimantId: string,
  noticeId: string,
) {
  const before = await readStatementState(noticeId)
  const [outcome] = await Promise.allSettled([
    recordEuCopyrightStatementOfReasons(staff, noticeId, {
      text: 'Private staff reasons',
      publicExplanation: 'No action taken.',
      outcome: 'no_action',
      targets: [],
    }),
  ])
  const after = await readStatementState(noticeId)
  const statement = after.decisions[0]
  const id = statement?.id
  expect([
    {
      outcome: { status: 'fulfilled', id },
      state: {
        ...before,
        notice: {
          ...before.notice,
          current_territorial_decision_identity_id: id,
          territorial_decision_outcome: 'no_action',
          territorial_decided_at: statement?.decided_at,
          territorial_decided_by_id: staff.id,
          territorial_authorizing_assessment_identity_id: null,
          rationale: 'Private staff reasons',
          explanation: 'No action taken.',
          last_legal_activity_at: expect.any(Date),
        },
        identities: [id],
        decisions: [
          {
            id,
            copyright_notice_id: noticeId,
            jurisdiction: 'eu_dsa',
            decided_by_id: staff.id,
            decided_at: expect.any(Date),
            outcome: 'no_action',
            assessment: null,
            supersedes: null,
            automation_disclosure: 'human',
            rationale: 'Private staff reasons',
            explanation: 'No action taken.',
          },
        ],
        deliveries: [
          ...before.deliveries,
          {
            kind: 'claimant_decision_notice',
            channel: 'email',
            actor: claimantId,
            role: 'claimant',
          },
          {
            kind: 'claimant_decision_notice',
            channel: 'in_app',
            actor: claimantId,
            role: 'claimant',
          },
        ].toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        correspondence: [...before.correspondence, 'decision_notice'].toSorted(),
      },
    },
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Conflicting copyright case change',
        causeCode: '40001',
      },
      state: before,
    },
  ]).toContainEqual({ outcome: copyrightRaceResult(outcome!), state: after })
  expect(after.notice.last_legal_activity_at.getTime()).toBeGreaterThanOrEqual(
    before.notice.last_legal_activity_at.getTime(),
  )
}

type CurrentNotice = {
  current_territorial_decision_identity_id: string | null
  territorial_decision_outcome: string | null
  territorial_decided_at: Date | null
  territorial_decided_by_id: string | null
  territorial_authorizing_assessment_identity_id: string | null
  territorial_rationale_ciphertext: string | null
  territorial_public_explanation_ciphertext: string | null
  last_legal_activity_at: Date
}
type Decision = {
  id: string
  copyright_notice_id: string
  jurisdiction: string
  decided_by_id: string
  decided_at: Date
  outcome: string
  assessment: string | null
  supersedes: string | null
  automation_disclosure: string
  rationale_ciphertext: string
  public_explanation_ciphertext: string
}
async function readStatementState(noticeId: string) {
  const [aggregate, { rows: notices }, { rows: identities }, { rows: decisions }] =
    await Promise.all([
      getCopyrightNoticePrivateAggregate(noticeId),
      write<CurrentNotice>(sql`/* readEuStatementState:notice */ SELECT
      current_territorial_decision_identity_id, territorial_decision_outcome, territorial_decided_at,
      territorial_decided_by_id, territorial_authorizing_assessment_identity_id,
      territorial_rationale_ciphertext, territorial_public_explanation_ciphertext, last_legal_activity_at
      FROM copyright_notices WHERE id = ${noticeId}`),
      write<{ id: string }>(sql`/* readEuStatementState:identities */ SELECT id
      FROM copyright_territorial_decision_identities WHERE copyright_notice_id = ${noticeId} ORDER BY id`),
      write<Decision>(sql`/* readEuStatementState:decisions */ SELECT id, copyright_notice_id, jurisdiction,
      decided_by_id, decided_at, outcome, copyright_notice_submission_assessment_identity_id AS assessment,
      supersedes_decision_id AS supersedes, automation_disclosure, rationale_ciphertext, public_explanation_ciphertext
      FROM copyright_territorial_decisions WHERE copyright_notice_id = ${noticeId} ORDER BY id`),
    ])
  if (!aggregate || !notices[0]) throw new Error('Owned EU statement case disappeared')
  const {
    territorial_rationale_ciphertext: rationale,
    territorial_public_explanation_ciphertext: explanation,
    ...notice
  } = notices[0]
  return {
    notice: {
      ...notice,
      rationale: rationale ? decryptSecret(rationale, `copyright-eu-statement:${noticeId}`) : null,
      explanation: explanation
        ? decryptSecret(explanation, `copyright-eu-public-explanation:${noticeId}`)
        : null,
    },
    identities: identities.map(row => row.id),
    decisions: decisions.map(({ rationale_ciphertext, public_explanation_ciphertext, ...row }) => ({
      ...row,
      rationale: decryptSecret(rationale_ciphertext, `copyright-eu-statement:${noticeId}`),
      explanation: decryptSecret(
        public_explanation_ciphertext,
        `copyright-eu-public-explanation:${noticeId}`,
      ),
    })),
    deliveries: aggregate.deliveryIntents
      .map(row => ({
        kind: row.delivery_kind,
        channel: row.channel,
        actor: row.recipient_user_id,
        role: row.recipient_role,
      }))
      .toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    correspondence: aggregate.correspondence.map(row => row.correspondence_kind).toSorted(),
    submissions: aggregate.submissions,
    assessments: aggregate.assessments,
    targets: aggregate.targets,
    restrictions: aggregate.restrictions,
    actions: aggregate.actionIntents,
    events: aggregate.lifecycleEvents,
    artifacts: aggregate.evidenceArtifacts,
    deadlines: aggregate.deadlines,
  }
}
