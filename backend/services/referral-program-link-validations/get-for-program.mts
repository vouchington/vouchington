import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { isUUID, validateUUID } from '@modules/utils'
import type { ReferralLinkValidation } from './validations.mts'
import { PROGRAM_VALIDATION_HYDRATION_LIMIT } from './list.mts'

export async function getReferralLinkValidationForProgram(
  referralProgramId: string,
  validationIdOrSlug: string,
  options?: QueryOptions,
): Promise<ReferralLinkValidation | null> {
  validateUUID(referralProgramId)

  const query = isUUID(validationIdOrSlug)
    ? sql`/* getReferralLinkValidationForProgram */
      SELECT v.id, v.slug, v.user_help_text, v.updated_at
      FROM referral_program_topic_link_validation_rule_sets j
      JOIN referral_program_link_validation_rule_sets v
        ON v.id = j.referral_program_link_validation_rule_set_id
      WHERE j.referral_program_topic_id = ${referralProgramId}
        AND j.referral_program_link_validation_rule_set_id = ${validationIdOrSlug}
      LIMIT ${PROGRAM_VALIDATION_HYDRATION_LIMIT}
    `
    : sql`/* getReferralLinkValidationForProgram */
      SELECT v.id, v.slug, v.user_help_text, v.updated_at
      FROM referral_program_link_validation_rule_sets v
      JOIN LATERAL (
        SELECT 1
        FROM referral_program_topic_link_validation_rule_sets j
        WHERE j.referral_program_topic_id = ${referralProgramId}
          AND j.referral_program_link_validation_rule_set_id = v.id
        LIMIT ${PROGRAM_VALIDATION_HYDRATION_LIMIT}
      ) linked ON true
      WHERE v.slug = ${validationIdOrSlug}
      LIMIT ${PROGRAM_VALIDATION_HYDRATION_LIMIT}
    `
  const { rows } = await read<ReferralLinkValidation>(query, options)
  return rows[0] ?? null
}
