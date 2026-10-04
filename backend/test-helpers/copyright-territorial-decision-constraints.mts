import { read } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { withRolledBackTerritorialTransaction } from './data-stores/psql/copyright-eu-uk-contracts.mts'

type Jurisdiction = 'eu_dsa' | 'uk'
type Fixture = { actorId: string; noticeId: string; otherNoticeId: string }

async function fixture(query: TransactionQuery, jurisdiction: Jurisdiction): Promise<Fixture> {
  const { rows } = await query<{
    actor_id: string
    notice_id: string
    other_notice_id: string
  }>(sql`/* territorialDecisionConstraintFixture */
    WITH actor AS (INSERT INTO users DEFAULT VALUES RETURNING id),
    first_notice AS (
      INSERT INTO copyright_notices (
        jurisdiction, legal_basis, received_at, claimant_contact_ciphertext,
        work_description, policy_version
      ) VALUES (${jurisdiction}, 'copyright', CURRENT_TIMESTAMP, 'contact', 'work', 'test-v1')
      RETURNING id
    ), second_notice AS (
      INSERT INTO copyright_notices (
        jurisdiction, legal_basis, received_at, claimant_contact_ciphertext,
        work_description, policy_version
      ) VALUES (${jurisdiction}, 'copyright', CURRENT_TIMESTAMP, 'contact', 'work', 'test-v1')
      RETURNING id
    )
    SELECT actor.id AS actor_id, first_notice.id AS notice_id,
      second_notice.id AS other_notice_id FROM actor, first_notice, second_notice`)
  const row = rows[0]
  if (!row) throw new Error('Missing territorial decision fixture')
  return { actorId: row.actor_id, noticeId: row.notice_id, otherNoticeId: row.other_notice_id }
}

async function assessment(
  query: TransactionQuery,
  noticeId: string,
  actorId: string | null,
  compliant: boolean,
): Promise<string> {
  const { rows } = await query<{ id: string }>(sql`/* territorialDecisionConstraintAssessment */
    WITH submission AS (
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, body_ciphertext
      ) VALUES (${noticeId}, 'notice', CURRENT_TIMESTAMP, 'staff', 'body') RETURNING id
    )
    INSERT INTO copyright_notice_submission_assessments (
      copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant
    ) SELECT id, CURRENT_TIMESTAMP, ${actorId}, ${compliant} FROM submission RETURNING id`)
  if (!rows[0]) throw new Error('Missing assessment fixture')
  return rows[0].id
}

async function decision(
  query: TransactionQuery,
  input: {
    noticeId: string
    jurisdiction: Jurisdiction
    actorId: string
    outcome: 'restrict' | 'no_action' | 'invalid'
    assessmentId?: string | null
    predecessorId?: string | null
    explanation?: string | null
  },
): Promise<string> {
  const { rows } = await query<{ id: string }>(sql`/* territorialDecisionConstraintDecision */
    INSERT INTO copyright_territorial_decisions (
      copyright_notice_id, jurisdiction, decided_by_id, outcome,
      copyright_notice_submission_assessment_id, supersedes_decision_id,
      automation_disclosure, rationale_ciphertext, public_explanation_ciphertext
    ) VALUES (
      ${input.noticeId}, ${input.jurisdiction}, ${input.actorId}, ${input.outcome},
      ${input.assessmentId === undefined ? null : input.assessmentId}, ${input.predecessorId === undefined ? null : input.predecessorId}, 'human', 'rationale',
      ${input.explanation === undefined ? 'Public explanation' : input.explanation}
    ) RETURNING id`)
  if (!rows[0]) throw new Error('Missing decision fixture')
  return rows[0].id
}

async function revoke(
  query: TransactionQuery,
  noticeId: string,
  decisionId: string,
  actorId: string,
) {
  await query(sql`/* territorialDecisionConstraintRevoke */
    WITH request AS (
      INSERT INTO copyright_territorial_redress_requests (
        copyright_notice_id, jurisdiction, copyright_territorial_decision_id,
        submitted_by_user_id, idempotency_key, explanation_ciphertext
      ) VALUES (${noticeId}, 'eu_dsa', ${decisionId}, ${actorId}, ${crypto.randomUUID()}, 'appeal')
      RETURNING id
    )
    INSERT INTO copyright_territorial_redress_decisions (
      copyright_territorial_redress_request_id, decided_by_id, staff_disposition,
      rationale_ciphertext
    ) SELECT id, ${actorId}, 'revoke', 'reversed' FROM request`)
}

export type TerritorialAssessmentProbe =
  | 'restrict_without_assessment'
  | 'no_action_with_assessment'
  | 'missing_explanation'
  | 'empty_explanation'
  | 'oversized_explanation'
  | 'foreign_assessment'
  | 'noncompliant_assessment'
  | 'automated_assessment'
  | 'invalid_outcome'
  | 'valid_restrict'

export async function probeTerritorialDecisionAssessment(
  scenario: TerritorialAssessmentProbe,
  jurisdiction: Jurisdiction = 'eu_dsa',
): Promise<void> {
  await withRolledBackTerritorialTransaction(async query => {
    const data = await fixture(query, jurisdiction)
    const requiresAssessment = !['restrict_without_assessment', 'invalid_outcome'].includes(
      scenario,
    )
    const foreign = scenario === 'foreign_assessment'
    const assessmentId = requiresAssessment
      ? await assessment(
          query,
          foreign ? data.otherNoticeId : data.noticeId,
          scenario === 'automated_assessment' ? null : data.actorId,
          scenario !== 'noncompliant_assessment',
        )
      : null
    await decision(query, {
      noticeId: data.noticeId,
      jurisdiction,
      actorId: data.actorId,
      outcome:
        scenario === 'invalid_outcome'
          ? 'invalid'
          : scenario === 'no_action_with_assessment'
            ? 'no_action'
            : 'restrict',
      assessmentId,
      explanation:
        scenario === 'missing_explanation'
          ? null
          : scenario === 'empty_explanation'
            ? ''
            : scenario === 'oversized_explanation'
              ? 'x'.repeat(1_048_577)
              : undefined,
    })
  })
}

export type TerritorialSuccessorProbe =
  | 'foreign_predecessor'
  | 'no_revoke'
  | 'restrict_predecessor'
  | 'valid_revoke'

export async function probeTerritorialDecisionSuccessor(
  scenario: TerritorialSuccessorProbe,
): Promise<void> {
  await withRolledBackTerritorialTransaction(async query => {
    const data = await fixture(query, 'eu_dsa')
    const foreign = scenario === 'foreign_predecessor'
    const predecessorNoticeId = foreign ? data.otherNoticeId : data.noticeId
    const predecessorAssessment =
      scenario === 'restrict_predecessor'
        ? await assessment(query, predecessorNoticeId, data.actorId, true)
        : null
    const predecessorId = await decision(query, {
      noticeId: predecessorNoticeId,
      jurisdiction: 'eu_dsa',
      actorId: data.actorId,
      outcome: scenario === 'restrict_predecessor' ? 'restrict' : 'no_action',
      assessmentId: predecessorAssessment,
    })
    if (scenario === 'valid_revoke' || scenario === 'restrict_predecessor')
      await revoke(query, predecessorNoticeId, predecessorId, data.actorId)
    const successorAssessment = await assessment(query, data.noticeId, data.actorId, true)
    await decision(query, {
      noticeId: data.noticeId,
      jurisdiction: 'eu_dsa',
      actorId: data.actorId,
      outcome: 'restrict',
      assessmentId: successorAssessment,
      predecessorId,
    })
  })
}

export async function readTerritorialPredecessorConstraint(): Promise<string> {
  const { rows } = await read<{ definition: string }>(sql`/* readTerritorialPredecessorConstraint */
    SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conname = 'fk_copyright_territorial_decisions__predecessor'`)
  return rows[0]?.definition ?? ''
}
