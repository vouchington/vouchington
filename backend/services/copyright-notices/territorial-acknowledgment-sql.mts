import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

export type TerritorialAcknowledgmentContract =
  | {
      jurisdiction: Extract<TerritorialCopyrightJurisdiction, 'eu_dsa'>
      notFound: 'EU copyright notice not found'
      queryName: 'recordEuAcknowledgment'
      acknowledgments: 'copyright_eu_notice_acknowledgments'
      receipts: 'copyright_eu_notice_receipts'
      receiptForeignKey: 'copyright_eu_notice_receipt_id'
      escalations: 'copyright_eu_escalations'
      acknowledgmentForeignKey: 'copyright_eu_notice_acknowledgment_id'
    }
  | {
      jurisdiction: Extract<TerritorialCopyrightJurisdiction, 'uk'>
      notFound: 'UK copyright notice not found'
      queryName: 'recordUkAcknowledgment'
      acknowledgments: 'copyright_uk_notice_acknowledgments'
      receipts: 'copyright_uk_notice_receipts'
      receiptForeignKey: 'copyright_uk_notice_receipt_id'
      escalations: 'copyright_uk_escalations'
      acknowledgmentForeignKey: 'copyright_uk_notice_acknowledgment_id'
    }

const ACKNOWLEDGMENT_IDENTIFIERS = {
  copyright_eu_notice_acknowledgments: 'copyright_eu_notice_acknowledgments',
  copyright_uk_notice_acknowledgments: 'copyright_uk_notice_acknowledgments',
  copyright_eu_notice_receipts: 'copyright_eu_notice_receipts',
  copyright_uk_notice_receipts: 'copyright_uk_notice_receipts',
  copyright_eu_notice_receipt_id: 'copyright_eu_notice_receipt_id',
  copyright_uk_notice_receipt_id: 'copyright_uk_notice_receipt_id',
  copyright_eu_escalations: 'copyright_eu_escalations',
  copyright_uk_escalations: 'copyright_uk_escalations',
  copyright_eu_notice_acknowledgment_id: 'copyright_eu_notice_acknowledgment_id',
  copyright_uk_notice_acknowledgment_id: 'copyright_uk_notice_acknowledgment_id',
} as const

const ACKNOWLEDGMENT_QUERY_NAMES = {
  recordEuAcknowledgment: 'recordEuAcknowledgment',
  recordUkAcknowledgment: 'recordUkAcknowledgment',
} as const

type AcknowledgmentIdentifier = keyof typeof ACKNOWLEDGMENT_IDENTIFIERS

export function lockTerritorialAcknowledgmentQuery(
  contract: TerritorialAcknowledgmentContract,
  noticeId: string,
) {
  return sql``
    .append(acknowledgmentComment(contract.queryName, ':lock'))
    .append(
      `
    SELECT acknowledgment.id, acknowledgment.attempt_count, acknowledgment.last_attempt_at,
      acknowledgment.acknowledged_at, acknowledgment.exhausted_at, receipt.requester_user_id,
      false AS escalated
    FROM `,
    )
    .append(acknowledgmentIdentifier(contract.acknowledgments))
    .append(
      ` acknowledgment
    JOIN `,
    )
    .append(acknowledgmentIdentifier(contract.receipts))
    .append(
      ` receipt
      ON receipt.id = acknowledgment.`,
    )
    .append(acknowledgmentIdentifier(contract.receiptForeignKey))
    .append(
      `
    WHERE receipt.copyright_notice_id = `,
    ).append(sql`${noticeId}
    FOR UPDATE OF acknowledgment`)
}

export function updateTerritorialAcknowledgmentQuery(
  contract: TerritorialAcknowledgmentContract,
  acknowledgmentId: string,
  outcome: 'acknowledged' | 'failed',
) {
  return sql``
    .append(acknowledgmentComment(contract.queryName, ''))
    .append(
      `
    UPDATE `,
    )
    .append(acknowledgmentIdentifier(contract.acknowledgments))
    .append(
      `
    SET attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP,
      acknowledged_at = CASE WHEN `,
    )
    .append(sql`${outcome}`)
    .append(
      ` = 'acknowledged' THEN CURRENT_TIMESTAMP ELSE acknowledged_at END,
      exhausted_at = CASE
        WHEN `,
    )
    .append(sql`${outcome}`)
    .append(
      ` = 'failed' AND attempt_count + 1 = 5 THEN CURRENT_TIMESTAMP
        ELSE exhausted_at
      END
    WHERE id = `,
    )
    .append(sql`${acknowledgmentId}`)
    .append(
      `
    RETURNING id, attempt_count, last_attempt_at, acknowledged_at, exhausted_at, false AS escalated`,
    )
}

export function insertTerritorialAcknowledgmentEscalationQuery(
  contract: TerritorialAcknowledgmentContract,
  noticeId: string,
  acknowledgmentId: string,
) {
  return sql``
    .append(acknowledgmentComment(contract.queryName, ':escalate'))
    .append(
      `
      INSERT INTO `,
    )
    .append(acknowledgmentIdentifier(contract.escalations))
    .append(
      ` (
        copyright_notice_id, `,
    )
    .append(acknowledgmentIdentifier(contract.acknowledgmentForeignKey))
    .append(
      `
      ) VALUES (`,
    )
    .append(sql`${noticeId}, ${acknowledgmentId}`)
    .append(`)`)
}

function acknowledgmentIdentifier(identifier: AcknowledgmentIdentifier): string {
  const literal = ACKNOWLEDGMENT_IDENTIFIERS[identifier]
  assert(literal === identifier, 500, 'Failed to record copyright acknowledgment')
  return literal
}

function acknowledgmentComment(
  queryName: TerritorialAcknowledgmentContract['queryName'],
  suffix: '' | ':lock' | ':escalate',
): string {
  const literal = ACKNOWLEDGMENT_QUERY_NAMES[queryName]
  assert(literal === queryName, 500, 'Failed to record copyright acknowledgment')
  return `/* ${literal}${suffix} */`
}
