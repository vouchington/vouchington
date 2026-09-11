import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { validateUUID } from '@modules/utils'

export type ReferralProgramValidationInfo = {
  user_help_text: string
  example_urls: string[]
}

export async function getValidationInfoForReferralProgram(
  referralProgramId: string,
  options?: QueryOptions,
): Promise<ReferralProgramValidationInfo | null> {
  validateUUID(referralProgramId)
  const { rows } = await read(
    sql`/* getValidationInfoForReferralProgram */
      SELECT
        rpv.user_help_text,
        rpvr.example_urls
      FROM topics__referral_program_link_validations trplv
      JOIN referral_program_link_validations rpv
        ON rpv.id = trplv.referral_program_link_validation_id
      JOIN referral_program_link_validations_rules rpvr
        ON rpvr.referral_program_link_validation_id = rpv.id
      WHERE trplv.referral_program_id = ${referralProgramId}
        AND rpvr.example_urls IS NOT NULL
        AND array_length(rpvr.example_urls, 1) > 0
        AND rpvr.is_referral_link_url = TRUE
        AND rpvr.is_invalid_referral_link_url = FALSE
      ORDER BY rpv.slug ASC, rpvr.id ASC
      LIMIT 1
    `,
    options,
  )

  return rows[0] ?? null
}
