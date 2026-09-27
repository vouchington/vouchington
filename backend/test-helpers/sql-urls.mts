import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getWebRiskHostnameAuditForTest(hostname: string): Promise<
  | {
      blocked_source: string | null
      web_risk_checked_url: string | null
      web_risk_threat_types: string[] | null
      web_risk_expire_at: Date | null
    }
  | undefined
> {
  const { rows } = await read<{
    blocked_source: string | null
    web_risk_checked_url: string | null
    web_risk_threat_types: string[] | null
    web_risk_expire_at: Date | null
  }>(
    `/* getWebRiskHostnameAuditForTest */
    SELECT uhb.blocked_source, uh.web_risk_checked_url, uh.web_risk_threat_types, uh.web_risk_expire_at
    FROM url_hostnames uh
    LEFT JOIN LATERAL (
      SELECT blocked_source
      FROM url_hostname_blocks
      WHERE url_hostname_id = uh.id
        AND lifted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    ) uhb ON true
    WHERE uh.hostname = $1`,
    [hostname],
  )
  return rows[0]
}

export async function urlExistsForTest(url: string): Promise<boolean> {
  const { rows } = await read<{ id: string }>(
    `/* urlExistsForTest */
    SELECT id FROM urls WHERE url = $1`,
    [url],
  )
  return rows.length > 0
}

export async function insertReferralProgramValidationRuleWithExamplesForTest(params: {
  validationId: string
  hostname: string
  pathname: string
  isReferralLinkUrl: boolean
  isInvalidReferralLinkUrl?: boolean
  userErrorText?: string
  exampleUrls: string[]
}): Promise<void> {
  await write(sql`/* insertReferralProgramValidationRuleWithExamplesForTest */
    INSERT INTO referral_program_link_validations_rules (
      referral_program_link_validation_id,
      hostname,
      pathname,
      is_referral_link_url,
      is_invalid_referral_link_url,
      user_error_text,
      example_urls
    )
    VALUES (
      ${params.validationId},
      ${params.hostname},
      ${params.pathname},
      ${params.isReferralLinkUrl},
      ${params.isInvalidReferralLinkUrl ?? false},
      ${params.userErrorText ?? null},
      ${params.exampleUrls}
    )
  `)
}

export async function setUrlHostnameAttemptThresholdHoursForTest(
  hostnameId: string,
  attemptThresholdHours: number,
): Promise<void> {
  await write(sql`/* setUrlHostnameAttemptThresholdHoursForTest */
    UPDATE url_hostnames
    SET attempt_threshold_hours = ${attemptThresholdHours}
    WHERE id = ${hostnameId}
  `)
}

export async function getUrlHostnameUnreliableStatusCodesForTest(
  hostnameId: string,
): Promise<number[] | null> {
  const { rows } = await read<{ unreliable_status_codes: number[] | null }>(
    sql`/* getUrlHostnameUnreliableStatusCodesForTest */
      SELECT unreliable_status_codes
      FROM url_hostnames
      WHERE id = ${hostnameId}
    `,
  )
  return rows[0]?.unreliable_status_codes ?? null
}
