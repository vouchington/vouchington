import {
  openCopyrightSecretsForCiphertexts,
  type ScopedCopyrightSecrets,
} from './encryption-keys.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql, { type SQLStatement } from 'sql-template-strings'
import { aiGuidanceSql } from './automated-assessment-sql.mts'
import type { CopyrightStatementInput } from './statement-of-reasons.mts'
import { copyrightPlacementPublicVisibleSql } from '@services/media-delivery-safety/copyright-placement-public-visible-sql'
import { decryptCopyrightText } from './erased-ciphertext.mts'
import { territorialLabels } from './territorial-labels.mts'

export type CopyrightStatementFacts = Pick<
  CopyrightStatementInput,
  | 'noticeId'
  | 'receivedAt'
  | 'jurisdiction'
  | 'legalBasis'
  | 'targetUrls'
  | 'automatedDecision'
  | 'aiGuidance'
  | 'claimantHasAccount'
  | 'explanation'
>

export type CopyrightStatementAuthority = {
  restrictionId?: string
  assessmentId?: string
  targetId?: string
}

/** Only public case facts enter a statement. Durable screening provenance survives moderator erasure. */
export async function selectCopyrightStatementFacts(
  noticeId: string,
  transaction: TransactionQuery,
  authority: CopyrightStatementAuthority = {},
): Promise<CopyrightStatementFacts> {
  return (await selectCopyrightStatementFactsBatch(noticeId, transaction, [authority]))[0]!
}

/** One statement reads the facts for every authority of one notice; results align with `authorities`. */
export async function selectCopyrightStatementFactsBatch(
  noticeId: string,
  transaction: TransactionQuery,
  authorities: readonly CopyrightStatementAuthority[],
): Promise<CopyrightStatementFacts[]> {
  const { rows } = await transaction<CopyrightStatementFactsRow>(
    sql`/* selectCopyrightStatementFacts */ `.append(
      copyrightStatementFactsSql(noticeId, authorities),
    ),
  )
  await using secrets = await openCopyrightSecretsForCiphertexts(
    { kind: 'notice', id: noticeId },
    rows.map(row => row.public_explanation_ciphertext),
    transaction,
  )
  return copyrightStatementFactsFromRows(noticeId, rows, authorities.length, secrets)
}

export type CopyrightStatementFactsRow = {
  id: string
  received_at: Date | string
  jurisdiction: string
  legal_basis: string
  target_urls: string[]
  automated_decision: boolean
  ai_guidance: boolean
  claimant_has_account: boolean
  public_explanation_ciphertext: string | null
  authority_is_current: boolean
  position: number
}

/** The facts query without its profile annotation, so a caller can fold it into a larger statement. */
export function copyrightStatementFactsSql(
  noticeId: string,
  authorities: readonly CopyrightStatementAuthority[],
): SQLStatement {
  return sql`
    SELECT notice.id, notice.received_at, notice.jurisdiction, notice.legal_basis,
      notice.claimant_user_id IS NOT NULL AS claimant_has_account,
      CASE WHEN authority.restriction_id IS NOT NULL THEN EXISTS (
        SELECT 1 FROM copyright_restrictions restriction
        WHERE restriction.id = authority.restriction_id
          AND restriction.copyright_notice_id = notice.id
          AND (authority.assessment_id IS NULL
            OR restriction.authorizing_assessment_id = authority.assessment_id)
      ) WHEN authority.assessment_id IS NOT NULL THEN EXISTS (
        SELECT 1 FROM copyright_notice_submissions submission
        WHERE submission.copyright_notice_id = notice.id
          AND submission.current_assessment_identity_id = authority.assessment_id
      ) ELSE TRUE END AS authority_is_current,
      ARRAY(SELECT target.hosted_use_url FROM copyright_notice_targets target
        WHERE target.copyright_notice_id = notice.id AND target.id = authority.target_id
          AND `
    .append(copyrightPlacementPublicVisibleSql())
    .append(sql` ORDER BY target.id) AS target_urls,
      (EXISTS (SELECT 1 FROM copyright_notice_submissions submission
        WHERE submission.copyright_notice_id = notice.id
          AND submission.current_assessment_identity_id = authority.assessment_id
          AND submission.current_assessment_form_screening_id IS NOT NULL)
       OR EXISTS (SELECT 1 FROM copyright_restrictions restriction
        WHERE restriction.id = authority.restriction_id
          AND restriction.copyright_notice_id = notice.id
          AND restriction.is_authorizing_assessment_automated)) AS automated_decision, `)
    .append(aiGuidanceSql())
    .append(
      sql` AS ai_guidance,
      CASE WHEN notice.territorial_authorizing_assessment_identity_id IS NOT DISTINCT FROM COALESCE(
        authority.assessment_id,
        (SELECT restriction.authorizing_assessment_id FROM copyright_restrictions restriction
          WHERE restriction.id = authority.restriction_id)
      ) THEN notice.territorial_public_explanation_ciphertext
      ELSE NULL END AS public_explanation_ciphertext,
      authority.position
    FROM unnest(
      ${authorities.map(authority => authority.targetId ?? null)}::uuid[],
      ${authorities.map(authority => authority.restrictionId ?? null)}::uuid[],
      ${authorities.map(authority => authority.assessmentId ?? null)}::uuid[]
    ) WITH ORDINALITY AS authority(target_id, restriction_id, assessment_id, position)
    JOIN copyright_notices notice ON notice.id = ${noticeId}
    ORDER BY authority.position
  `,
    )
}

/** Maps the rows of `copyrightStatementFactsSql`; one row per authority proves the notice exists. */
export function copyrightStatementFactsFromRows(
  noticeId: string,
  rows: readonly CopyrightStatementFactsRow[],
  expected: number,
  secrets: ScopedCopyrightSecrets | null,
): CopyrightStatementFacts[] {
  assert(rows.length === expected, 404, 'Copyright notice not found')
  assert(
    rows.every(row => row.authority_is_current),
    409,
    'Copyright statement authority is stale',
  )
  return rows.map(row => ({
    noticeId: row.id,
    receivedAt: new Date(row.received_at),
    jurisdiction: row.jurisdiction,
    legalBasis: row.legal_basis,
    targetUrls: row.target_urls,
    automatedDecision: row.automated_decision,
    aiGuidance: row.ai_guidance,
    claimantHasAccount: row.claimant_has_account,
    explanation:
      row.public_explanation_ciphertext &&
      (row.jurisdiction === 'eu_dsa' || row.jurisdiction === 'uk')
        ? (decryptCopyrightText(
            row.public_explanation_ciphertext,
            `${territorialLabels(row.jurisdiction).publicExplanationPurpose}:${noticeId}`,
            secrets,
          ) ?? undefined)
        : undefined,
  }))
}
