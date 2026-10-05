import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { buildCopyrightStatementOfReasons } from './statement-of-reasons.mts'
import { selectCopyrightStatementFacts } from './statement-of-reasons-facts.mts'
import {
  DSA_COPYRIGHT_DECISION_FACTS,
  DSA_COPYRIGHT_ILLEGAL_CONTENT_EXPLANATION,
  DSA_COPYRIGHT_LEGAL_GROUNDS,
  DSA_EEA_TERRITORIAL_SCOPE,
} from './dsa-statement-templates.mts'
import { inAreaTrustedFlaggerMatchSql } from './trusted-flagger-match.mts'

export type DsaStatementPayload = {
  decision_visibility: ['DECISION_VISIBILITY_CONTENT_DISABLED']
  decision_ground: 'DECISION_GROUND_ILLEGAL_CONTENT'
  content_type: ['CONTENT_TYPE_IMAGE']
  category: 'STATEMENT_CATEGORY_INTELLECTUAL_PROPERTY_INFRINGEMENTS'
  category_specification: ['KEYWORD_COPYRIGHT_INFRINGEMENT']
  territorial_scope: string[]
  content_date: string
  application_date: string
  decision_facts: string
  illegal_content_legal_ground: string
  illegal_content_explanation: string
  source_type: 'SOURCE_ARTICLE_16' | 'SOURCE_TRUSTED_FLAGGER'
  automated_detection: 'Yes' | 'No'
  automated_decision:
    | 'AUTOMATED_DECISION_FULLY'
    | 'AUTOMATED_DECISION_PARTIALLY'
    | 'AUTOMATED_DECISION_NOT_AUTOMATED'
  puid: string
}

type RestrictionFacts = {
  copyright_notice_id: string
  authorizing_assessment_id: string
  copyright_notice_target_id: string
  imposed_at: Date
  content_at: Date | null
  trusted: boolean
}

/** Materialize once in the outbox transaction. No case text or actor id enters the payload. */
export async function buildCopyrightDsaStatementPayload(
  restrictionId: string,
  transaction: TransactionQuery,
): Promise<DsaStatementPayload> {
  const statement = sql`/* buildCopyrightDsaStatementPayload */
    SELECT restriction.copyright_notice_id, restriction.authorizing_assessment_id,
      restriction.copyright_notice_target_id, restriction.imposed_at,
      CASE WHEN image.id IS NULL THEN uuid_extract_timestamp(target_image.image_id)
        ELSE image.upload_completed_at END AS content_at,
      `
  statement.append(inAreaTrustedFlaggerMatchSql(sql``.append('notice.id')))
  statement.append(sql` AS trusted
    FROM copyright_restrictions restriction
    JOIN copyright_notices notice ON notice.id = restriction.copyright_notice_id
    JOIN copyright_notice_target_images target_image
      ON target_image.copyright_notice_target_id = restriction.copyright_notice_target_id
    LEFT JOIN images image ON image.id = target_image.image_id
    WHERE restriction.id = ${restrictionId}
  `)
  const { rows } = await transaction<RestrictionFacts>(statement)
  const row = rows[0]
  assert(row, 404, 'Copyright restriction not found')
  assert(row.content_at, 422, 'Copyright target image has no upload date')
  const facts = await selectCopyrightStatementFacts(row.copyright_notice_id, transaction, {
    restrictionId,
    assessmentId: row.authorizing_assessment_id,
    targetId: row.copyright_notice_target_id,
  })
  const { fields } = buildCopyrightStatementOfReasons({
    ...facts,
    audience: 'poster',
    event: 'restricted',
  })
  assert(
    fields.restriction?.type === 'visibility_restriction' &&
      fields.restriction.subject === 'image' &&
      !fields.restriction.deleted &&
      fields.restriction.scope === 'global' &&
      fields.facts.basis === 'notice',
    500,
    'Unsupported copyright statement restriction',
  )
  const decision = fields.automation.decision
  assert(decision !== 'automatic_deadline', 500, 'Unsupported restriction automation')
  const payload: DsaStatementPayload = {
    decision_visibility: ['DECISION_VISIBILITY_CONTENT_DISABLED'],
    decision_ground: 'DECISION_GROUND_ILLEGAL_CONTENT',
    content_type: ['CONTENT_TYPE_IMAGE'],
    category: 'STATEMENT_CATEGORY_INTELLECTUAL_PROPERTY_INFRINGEMENTS',
    category_specification: ['KEYWORD_COPYRIGHT_INFRINGEMENT'],
    territorial_scope: [...DSA_EEA_TERRITORIAL_SCOPE],
    content_date: row.content_at.toISOString().slice(0, 10),
    application_date: row.imposed_at.toISOString().slice(0, 10),
    decision_facts: DSA_COPYRIGHT_DECISION_FACTS,
    illegal_content_legal_ground: DSA_COPYRIGHT_LEGAL_GROUNDS[fields.legalGround.jurisdiction],
    illegal_content_explanation: DSA_COPYRIGHT_ILLEGAL_CONTENT_EXPLANATION,
    source_type: row.trusted ? 'SOURCE_TRUSTED_FLAGGER' : 'SOURCE_ARTICLE_16',
    automated_detection: fields.automation.detection ? 'Yes' : 'No',
    automated_decision:
      decision === 'automatic_pending_review'
        ? 'AUTOMATED_DECISION_FULLY'
        : fields.automation.aiGuidance
          ? 'AUTOMATED_DECISION_PARTIALLY'
          : 'AUTOMATED_DECISION_NOT_AUTOMATED',
    puid: restrictionId,
  }
  assertDsaStatementPayload(payload)
  return payload
}

const payloadKeys = [
  'decision_visibility',
  'decision_ground',
  'content_type',
  'category',
  'category_specification',
  'territorial_scope',
  'content_date',
  'application_date',
  'decision_facts',
  'illegal_content_legal_ground',
  'illegal_content_explanation',
  'source_type',
  'automated_detection',
  'automated_decision',
  'puid',
] as const

/** Validate both newly materialized and persisted JSON against the public closed contract. */
export function assertDsaStatementPayload(value: unknown): asserts value is DsaStatementPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid DSA payload')
  const payload = value as Record<string, unknown>
  if (
    Object.keys(payload).length !== payloadKeys.length ||
    Object.keys(payload).some(key => !payloadKeys.includes(key as (typeof payloadKeys)[number]))
  )
    throw new Error('Unexpected DSA payload key')
  if (
    !sameSingle(payload.decision_visibility, 'DECISION_VISIBILITY_CONTENT_DISABLED') ||
    payload.decision_ground !== 'DECISION_GROUND_ILLEGAL_CONTENT' ||
    !sameSingle(payload.content_type, 'CONTENT_TYPE_IMAGE') ||
    payload.category !== 'STATEMENT_CATEGORY_INTELLECTUAL_PROPERTY_INFRINGEMENTS' ||
    !sameSingle(payload.category_specification, 'KEYWORD_COPYRIGHT_INFRINGEMENT') ||
    !Array.isArray(payload.territorial_scope) ||
    payload.territorial_scope.length !== DSA_EEA_TERRITORIAL_SCOPE.length ||
    payload.territorial_scope.some((code, index) => code !== DSA_EEA_TERRITORIAL_SCOPE[index]) ||
    !validDate(payload.content_date, '2000-01-01') ||
    !validDate(payload.application_date, '2020-01-01') ||
    !boundedText(payload.decision_facts, 5000) ||
    !boundedText(payload.illegal_content_legal_ground, 500) ||
    !boundedText(payload.illegal_content_explanation, 2000) ||
    typeof payload.source_type !== 'string' ||
    !['SOURCE_ARTICLE_16', 'SOURCE_TRUSTED_FLAGGER'].includes(payload.source_type) ||
    typeof payload.automated_detection !== 'string' ||
    !['Yes', 'No'].includes(payload.automated_detection) ||
    typeof payload.automated_decision !== 'string' ||
    ![
      'AUTOMATED_DECISION_FULLY',
      'AUTOMATED_DECISION_PARTIALLY',
      'AUTOMATED_DECISION_NOT_AUTOMATED',
    ].includes(payload.automated_decision) ||
    typeof payload.puid !== 'string' ||
    !/^[A-Za-z0-9_-]{1,500}$/.test(payload.puid)
  )
    throw new Error('Invalid DSA statement payload')
}

function sameSingle(value: unknown, expected: string): boolean {
  return Array.isArray(value) && value.length === 1 && value[0] === expected
}

function boundedText(value: unknown, maximum: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
}

function validDate(value: unknown, earliest: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < earliest)
    return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
}
