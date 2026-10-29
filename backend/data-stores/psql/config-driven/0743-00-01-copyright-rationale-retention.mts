import { COPYRIGHT_PRESERVATION_PARTIES_SQL } from '../copyright-preservation-parties.mts'

/** The SQL guard and cleanup share the canonical case-party preservation contract. */
export default function createCopyrightRationaleRetention(): string {
  if (COPYRIGHT_PRESERVATION_PARTIES_SQL.values.length !== 0)
    throw new Error('Copyright preservation party SQL must be parameter-free')
  return `
CREATE OR REPLACE FUNCTION fn_copyright_decision_rationale_retention_eligible(
  rationale copyright_decision_rationales, cutoff_at timestamptz
) RETURNS boolean LANGUAGE sql STABLE AS $function$
  WITH retention_bound AS (
    SELECT LEAST(cutoff_at,
      ((transaction_timestamp() AT TIME ZONE 'UTC') - INTERVAL '6 years') AT TIME ZONE 'UTC'
    ) AS eligible_before_at
  ), preserved_cases AS NOT MATERIALIZED (
    ${COPYRIGHT_PRESERVATION_PARTIES_SQL.text}
  )
  SELECT uuid_extract_timestamp(rationale.id) < retention_bound.eligible_before_at AND (
    (rationale.copyright_notice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM copyright_notices notice WHERE notice.id = rationale.copyright_notice_id
        AND (
          (notice.jurisdiction = 'us_dmca' AND rationale.rationale_ciphertext = 'erased'
            AND EXISTS (SELECT 1 FROM copyright_notice_retention_erasures erasure
              WHERE erasure.copyright_notice_id = notice.id))
          OR (notice.jurisdiction IN ('eu_dsa', 'uk') AND NOT EXISTS (
            SELECT 1 FROM preserved_cases held
            WHERE held.notice_id = notice.id AND held.released_at IS NULL))
        )
    ))
    OR (rationale.copyright_notice_email_intake_receipt_id IS NOT NULL AND (
      (rationale.rationale_ciphertext = 'erased'
        AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
          WHERE link.copyright_notice_email_intake_receipt_id = rationale.copyright_notice_email_intake_receipt_id)
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
          WHERE link.copyright_notice_email_intake_receipt_id = rationale.copyright_notice_email_intake_receipt_id
            AND NOT EXISTS (SELECT 1 FROM copyright_notice_retention_erasures erasure
              WHERE erasure.copyright_notice_id = link.copyright_notice_id)))
      OR (EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
          JOIN copyright_notices notice ON notice.id = link.copyright_notice_id
          WHERE link.copyright_notice_email_intake_receipt_id = rationale.copyright_notice_email_intake_receipt_id
            AND notice.jurisdiction IN ('eu_dsa', 'uk'))
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
          JOIN copyright_notices notice ON notice.id = link.copyright_notice_id
          WHERE link.copyright_notice_email_intake_receipt_id = rationale.copyright_notice_email_intake_receipt_id
            AND ((notice.jurisdiction = 'us_dmca' AND NOT (rationale.rationale_ciphertext = 'erased'
              AND EXISTS (SELECT 1 FROM copyright_notice_retention_erasures erasure
                WHERE erasure.copyright_notice_id = notice.id)))
              OR EXISTS (SELECT 1 FROM preserved_cases held
              WHERE held.notice_id = notice.id AND held.released_at IS NULL))))
      OR (NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
          WHERE link.copyright_notice_email_intake_receipt_id = rationale.copyright_notice_email_intake_receipt_id)
        AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
          WHERE receipt.id = rationale.copyright_notice_email_intake_receipt_id
            AND receipt.review_decision = 'rejected'
            AND receipt.reviewed_at < retention_bound.eligible_before_at)
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items delivery
          WHERE delivery.copyright_notice_email_intake_receipt_id = rationale.copyright_notice_email_intake_receipt_id
            AND (delivery.state IN ('pending', 'claimed') OR delivery.updated_at >= retention_bound.eligible_before_at)))
    ))
    OR (rationale.copyright_repeat_infringer_review_identity_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM copyright_repeat_infringer_review_identities review
        WHERE review.id = rationale.copyright_repeat_infringer_review_identity_id
          AND NOT EXISTS (SELECT 1 FROM user_legal_preservation_holds held
            WHERE held.account_user_id = review.account_user_id AND held.released_at IS NULL)))
    OR (rationale.account_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM user_legal_preservation_holds held
        WHERE held.account_user_id = rationale.account_user_id
          AND (held.released_at IS NULL OR held.released_at >= retention_bound.eligible_before_at)))
  ) FROM retention_bound
$function$;
COMMENT ON FUNCTION fn_copyright_decision_rationale_retention_eligible(copyright_decision_rationales, timestamptz)
  IS 'Retires six-calendar-year attempted rationale independently of finite review history, preserving scoped legal holds and existing US case erasure requirements.';
`
}
