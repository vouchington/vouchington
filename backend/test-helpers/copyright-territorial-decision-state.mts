import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import type { createTestTerritorialRestrictionScene } from './copyright-territorial-restriction-fixtures.mts'

export type TerritorialRestrictionScene = Awaited<
  ReturnType<typeof createTestTerritorialRestrictionScene>
>
/** Every admission/current-parent fact, authority, audit and downstream legal/account consequence. */
export async function readTerritorialDecisionState(
  jurisdiction: 'eu_dsa' | 'uk',
  scene: TerritorialRestrictionScene,
) {
  const [
    aggregate,
    effective,
    { rows: parents },
    { rows: decisions },
    { rows: identities },
    { rows: receipts },
  ] = await Promise.all([
    getCopyrightNoticePrivateAggregate(scene.noticeId),
    readEffectiveReviewState(
      scene.noticeId,
      scene.posts.map(post => post.poster.id),
    ),
    write<{
      id: string | null
      outcome: string | null
      at: Date | null
      actor: string | null
      assessment: string | null
      rationale: string | null
      explanation: string | null
      clock: Date
    }>(sql`/* readTerritorialDecisionState:parent */
      SELECT current_territorial_decision_identity_id AS id,territorial_decision_outcome AS outcome,
      territorial_decided_at AS at,territorial_decided_by_id AS actor,territorial_authorizing_assessment_identity_id AS assessment,
      territorial_rationale_ciphertext AS rationale,territorial_public_explanation_ciphertext AS explanation,last_legal_activity_at AS clock
      FROM copyright_notices WHERE id = ${scene.noticeId}`),
    write<{
      id: string
      notice: string
      jurisdiction: string
      actor: string
      outcome: string
      assessment: string | null
      predecessor: string | null
      automation: string
      at: Date
      rationale: string
      explanation: string
    }>(sql`/* readTerritorialDecisionState:decisions */
      SELECT id,copyright_notice_id AS notice,jurisdiction,decided_by_id AS actor,outcome,
      copyright_notice_submission_assessment_identity_id AS assessment,supersedes_decision_id AS predecessor,
      automation_disclosure AS automation,decided_at AS at,rationale_ciphertext AS rationale,public_explanation_ciphertext AS explanation
      FROM copyright_territorial_decisions WHERE copyright_notice_id = ${scene.noticeId} ORDER BY id`),
    write<{ id: string; notice: string; jurisdiction: string }>(
      sql`/* readTerritorialDecisionState:identities */ SELECT id,copyright_notice_id AS notice,jurisdiction FROM copyright_territorial_decision_identities WHERE copyright_notice_id = ${scene.noticeId} ORDER BY id`,
    ),
    write<{ id: string; at: Date }>(
      sql`/* readTerritorialDecisionState:receipt */ SELECT id,received_at AS at FROM copyright_territorial_notice_receipts WHERE copyright_notice_id = ${scene.noticeId}`,
    ),
  ])
  if (!aggregate || !parents[0] || !receipts[0])
    throw new Error('Owned territorial decision source disappeared')
  const labels = territorialLabels(jurisdiction)
  const decode = (row: { rationale: string | null; explanation: string | null }) => ({
    rationale: row.rationale
      ? decryptSecret(row.rationale, `${labels.decisionPurpose}:${scene.noticeId}`)
      : null,
    explanation: row.explanation
      ? decryptSecret(row.explanation, `${labels.publicExplanationPurpose}:${scene.noticeId}`)
      : null,
  })
  return {
    effective,
    notice: aggregate.notice,
    parent: { ...parents[0], ...decode(parents[0]) },
    decisions: decisions.map(row => ({ ...row, ...decode(row) })),
    identities,
    receipts,
    submissions: aggregate.submissions.map(row => ({
      id: row.id,
      notice: row.copyright_notice_id,
      author: row.submitted_by_id,
      kind: row.kind,
      source: row.source_kind,
      at: row.received_at,
      body: JSON.parse(decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(row.id))),
    })),
    assessors: aggregate.assessments.map(row => ({
      id: row.id,
      submission: row.copyright_notice_submission_id,
      reviewer: row.assessed_by_id,
      screen: row.copyright_notice_form_screening_id,
      at: row.assessed_at,
    })),
    untouched: {
      appeals: aggregate.appealReviews,
      recommendations: aggregate.appealRecommendations,
      counters: aggregate.counterNoticeReviews,
      emails: aggregate.emailCorrespondenceReviews,
      holds: aggregate.holdAssessments,
      resolutions: aggregate.holdResolutions,
      evidence: aggregate.evidenceArtifacts,
    },
  }
}
