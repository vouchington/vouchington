import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestTopic } from './topics.mts'

export async function createReferralProgramFixture(data: {
  createdById: string
  randomSuffix?: string
  hostname?: string
  pathname?: string
  slug?: string
}): Promise<{
  referralProgramId: string
  validationId: string
  ruleId: string
  hostname: string
}> {
  const randomSuffix = data.randomSuffix || Math.random().toString(36).slice(2, 10)
  const hostname = data.hostname || `referral-${randomSuffix}.example.com`
  const pathname = data.pathname || '/ref/%'

  const referralProgramId = await insertTestTopic({
    name: `Referral Program ${randomSuffix}`,
    slug: data.slug || `referral-program-${randomSuffix}`,
    createdById: data.createdById,
    topicType: 'referral_program',
  })

  const validation = await write(sql`
    INSERT INTO referral_program_link_validations (slug, user_help_text)
    VALUES (${`validation_${randomSuffix}`}, 'test validation')
    RETURNING id
  `)
  const validationId = validation.rows[0].id

  const rule = await write(sql`
    INSERT INTO referral_program_link_validations_rules (
      referral_program_link_validation_id,
      hostname,
      pathname,
      is_referral_link_url
    )
    VALUES (${validationId}, ${hostname}, ${pathname}, true)
    RETURNING id
  `)
  const ruleId = rule.rows[0].id

  await write(sql`
    INSERT INTO topics__referral_programs (topic_id, enabled_at)
    VALUES (${referralProgramId}, CURRENT_TIMESTAMP)
    ON CONFLICT (topic_id) DO UPDATE
    SET enabled_at = CURRENT_TIMESTAMP,
        disabled_at = NULL
  `)

  await write(sql`
    INSERT INTO topics__referral_program_link_validations (
      referral_program_id,
      referral_program_link_validation_id
    )
    VALUES (${referralProgramId}, ${validationId})
    ON CONFLICT (referral_program_id, referral_program_link_validation_id) DO NOTHING
  `)

  return {
    referralProgramId,
    validationId,
    ruleId,
    hostname,
  }
}

export async function createReferralProgramLinkValidation(
  slug: string,
  userHelpText = 'Test help text',
): Promise<string> {
  const result = await write(sql`
    INSERT INTO referral_program_link_validations (slug, user_help_text)
    VALUES (${slug}, ${userHelpText})
    RETURNING id
  `)

  return result.rows[0].id
}

export async function createReferralProgramLinkValidationRule(data: {
  validationId: string
  hostname: string
  pathname: string
  isReferralLinkUrl?: boolean
  isInvalidReferralLinkUrl?: boolean
  userErrorText?: string | null
}): Promise<string> {
  const result = await write(sql`
    INSERT INTO referral_program_link_validations_rules (
      referral_program_link_validation_id,
      hostname,
      pathname,
      is_referral_link_url,
      is_invalid_referral_link_url,
      user_error_text
    )
    VALUES (
      ${data.validationId},
      ${data.hostname},
      ${data.pathname},
      ${data.isReferralLinkUrl ?? true},
      ${data.isInvalidReferralLinkUrl ?? false},
      ${data.userErrorText === undefined ? null : data.userErrorText}
    )
    RETURNING id
  `)

  return result.rows[0].id
}

export async function enableReferralProgramByTopicId(referralProgramId: string): Promise<void> {
  await write(sql`
    INSERT INTO topics__referral_programs (topic_id, enabled_at)
    VALUES (${referralProgramId}, CURRENT_TIMESTAMP)
    ON CONFLICT (topic_id) DO UPDATE
    SET enabled_at = CURRENT_TIMESTAMP,
        disabled_at = NULL
  `)
}

export async function disableReferralProgramByTopicId(referralProgramId: string): Promise<void> {
  await write(sql`
    UPDATE topics__referral_programs
    SET disabled_at = CURRENT_TIMESTAMP, enabled_at = NULL
    WHERE topic_id = ${referralProgramId}
  `)
}

export async function assignValidationToReferralProgram(
  referralProgramId: string,
  validationId: string,
): Promise<void> {
  await write(sql`
    INSERT INTO topics__referral_program_link_validations (
      referral_program_id,
      referral_program_link_validation_id
    )
    VALUES (${referralProgramId}, ${validationId})
    ON CONFLICT (referral_program_id, referral_program_link_validation_id) DO NOTHING
  `)
}

export async function setTopicReferralProgramId(
  topicId: string,
  referralProgramId: string,
): Promise<void> {
  await write(sql`
    UPDATE topics SET referral_program_id = ${referralProgramId} WHERE id = ${topicId}
  `)
}
