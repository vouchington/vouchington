import { read } from '@data-stores/psql'
import {
  createTerritorialConstraintAssessment,
  createTerritorialConstraintDecision,
  createTerritorialConstraintRevocation,
  createTerritorialDecisionConstraintFixture,
} from './copyright-territorial-decision-fixture.mts'
import sql from 'sql-template-strings'
import { withRolledBackTerritorialTransaction } from './data-stores/psql/copyright-eu-uk-contracts.mts'

type Jurisdiction = 'eu_dsa' | 'uk'
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
    const data = await createTerritorialDecisionConstraintFixture(query, jurisdiction)
    const requiresAssessment = !['restrict_without_assessment', 'invalid_outcome'].includes(
      scenario,
    )
    const foreign = scenario === 'foreign_assessment'
    const assessmentId = requiresAssessment
      ? await createTerritorialConstraintAssessment(
          query,
          foreign ? data.otherNoticeId : data.noticeId,
          scenario === 'automated_assessment' ? null : data.actorId,
          scenario !== 'noncompliant_assessment',
        )
      : null
    await createTerritorialConstraintDecision(query, {
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
    const data = await createTerritorialDecisionConstraintFixture(query, 'eu_dsa')
    const foreign = scenario === 'foreign_predecessor'
    const predecessorNoticeId = foreign ? data.otherNoticeId : data.noticeId
    const predecessorAssessment =
      scenario === 'restrict_predecessor'
        ? await createTerritorialConstraintAssessment(
            query,
            predecessorNoticeId,
            data.actorId,
            true,
          )
        : null
    const predecessorId = await createTerritorialConstraintDecision(query, {
      noticeId: predecessorNoticeId,
      jurisdiction: 'eu_dsa',
      actorId: data.actorId,
      outcome: scenario === 'restrict_predecessor' ? 'restrict' : 'no_action',
      assessmentId: predecessorAssessment,
    })
    if (scenario === 'valid_revoke' || scenario === 'restrict_predecessor')
      await createTerritorialConstraintRevocation(
        query,
        predecessorNoticeId,
        predecessorId,
        data.actorId,
      )
    const successorAssessment = await createTerritorialConstraintAssessment(
      query,
      data.noticeId,
      data.actorId,
      true,
    )
    await createTerritorialConstraintDecision(query, {
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
