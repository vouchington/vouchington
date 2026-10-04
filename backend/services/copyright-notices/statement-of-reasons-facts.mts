import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import {
  automatedAssessmentSql,
  automaticRestrictionSql,
  aiGuidanceSql,
} from './automated-assessment-sql.mts'
import type { CopyrightStatementInput } from './statement-of-reasons.mts'
import { copyrightPlacementPublicVisibleSql } from '@services/media-delivery-safety/copyright-placement-public-visible-sql'
import { decryptCopyrightText } from './erased-ciphertext.mts'
import { territorialLabels } from './territorial-labels.mts'
import { territorialDecisionIsLiveSql } from './territorial-redress-sql.mts'

type CopyrightStatementFacts = Pick<
  CopyrightStatementInput,
  | 'noticeId'
  | 'receivedAt'
  | 'jurisdiction'
  | 'legalBasis'
  | 'targetUrls'
  | 'automatedDecision'
  | 'aiGuidance'
  | 'explanation'
>

/** Only public case facts enter a statement. Durable screening provenance survives moderator erasure. */
export async function selectCopyrightStatementFacts(
  noticeId: string,
  transaction: TransactionQuery,
  authority: { restrictionId?: string; assessmentId?: string; targetId?: string } = {},
): Promise<CopyrightStatementFacts> {
  const { rows } = await transaction<{
    id: string
    received_at: Date
    jurisdiction: string
    legal_basis: string
    target_urls: string[]
    automated_decision: boolean
    ai_guidance: boolean
    public_explanation_ciphertext: string | null
  }>(
    sql`/* selectCopyrightStatementFacts */
    SELECT notice.id, notice.received_at, notice.jurisdiction, notice.legal_basis,
      ARRAY(SELECT target.hosted_use_url FROM copyright_notice_targets target
        WHERE target.copyright_notice_id = notice.id AND target.id = ${authority.targetId ?? null}
          AND `
      .append(copyrightPlacementPublicVisibleSql())
      .append(sql` ORDER BY target.id) AS target_urls,
      (`)
      .append(
        sql`EXISTS (SELECT 1 FROM copyright_notice_submission_assessments assessment WHERE assessment.id = ${authority.assessmentId ?? null} AND (`,
      )
      .append(automatedAssessmentSql())
      .append(
        sql`)) OR EXISTS (SELECT 1 FROM copyright_restrictions restriction WHERE restriction.id = ${authority.restrictionId ?? null} AND (`,
      )
      .append(automaticRestrictionSql())
      .append('))) AS automated_decision, ')
      .append(aiGuidanceSql())
      .append(
        sql` AS ai_guidance,
      territorial_decision.public_explanation_ciphertext
    FROM copyright_notices notice
    LEFT JOIN LATERAL (
      SELECT decision.public_explanation_ciphertext
      FROM copyright_territorial_decisions decision
      WHERE decision.copyright_notice_id = notice.id
        AND decision.jurisdiction = notice.jurisdiction
        AND `.append(territorialDecisionIsLiveSql()).append(sql`
        AND (
          (${authority.assessmentId ?? null}::uuid IS NULL
            AND ${authority.restrictionId ?? null}::uuid IS NULL)
          OR decision.copyright_notice_submission_assessment_id = COALESCE(
            ${authority.assessmentId ?? null}::uuid,
            (SELECT restriction.authorizing_assessment_id FROM copyright_restrictions restriction
              WHERE restriction.id = ${authority.restrictionId ?? null}::uuid)
          )
        )
      LIMIT 1
    ) territorial_decision ON true
    WHERE notice.id = ${noticeId}
  `),
      ),
  )
  const row = rows[0]
  assert(row, 404, 'Copyright notice not found')
  return {
    noticeId: row.id,
    receivedAt: row.received_at,
    jurisdiction: row.jurisdiction,
    legalBasis: row.legal_basis,
    targetUrls: row.target_urls,
    automatedDecision: row.automated_decision,
    aiGuidance: row.ai_guidance,
    explanation:
      row.public_explanation_ciphertext &&
      (row.jurisdiction === 'eu_dsa' || row.jurisdiction === 'uk')
        ? (decryptCopyrightText(
            row.public_explanation_ciphertext,
            `${territorialLabels(row.jurisdiction).publicExplanationPurpose}:${noticeId}`,
          ) ?? undefined)
        : undefined,
  }
}
