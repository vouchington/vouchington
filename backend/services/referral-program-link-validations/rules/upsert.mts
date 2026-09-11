import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ReferralLinkValidationRule } from './types.mts'
import { withReferralLinkEligibilityMutationLock } from '@services/entity-relations/referral-link-eligibility-lock'

export async function upsertReferralLinkValidationRule(
  validationId: string,
  data: {
    hostname: string
    pathname: string
    example_urls?: string[] | null
  },
): Promise<ReferralLinkValidationRule> {
  const hostname = data.hostname.toLowerCase().trim()
  const pathname = data.pathname.trim()

  const { rows: existing } = await read(
    sql`/* upsertReferralLinkValidationRule:get */
      SELECT
        id,
        referral_program_link_validation_id,
        hostname,
        pathname,
        is_referral_link_url,
        is_invalid_referral_link_url,
        user_error_text,
        example_urls,
        created_at,
        updated_at
      FROM referral_program_link_validations_rules
      WHERE referral_program_link_validation_id = ${validationId}
        AND hostname = ${hostname}
        AND pathname = ${pathname}
      LIMIT 1
    `,
  )

  if (existing[0]) return existing[0]

  const exampleUrls = data.example_urls ?? null

  return withReferralLinkEligibilityMutationLock({}, async query => {
    const { rows } = await query(sql`/* upsertReferralLinkValidationRule:insert */
      INSERT INTO referral_program_link_validations_rules (
        referral_program_link_validation_id,
        hostname,
        pathname,
        example_urls
      )
      VALUES (
        ${validationId},
        ${hostname},
        ${pathname},
        ${exampleUrls}
      )
      RETURNING
        id,
        referral_program_link_validation_id,
        hostname,
        pathname,
        is_referral_link_url,
        is_invalid_referral_link_url,
        user_error_text,
        example_urls,
        created_at,
        updated_at
    `)
    return rows[0]
  })
}
