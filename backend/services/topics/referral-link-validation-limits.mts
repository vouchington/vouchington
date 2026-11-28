import type { TransactionQuery } from '@data-stores/psql'
import { DynamicConfig } from '@data-stores/valkey'
import {
  REFERRAL_LINK_VALIDATION_RULE_LIMIT_REACHED,
  REFERRAL_LINK_VALIDATION_RULE_SET_LIMIT_REACHED,
} from '@modules/on-error/error-codes'
import { createCodedError } from '@vouchington/sentry'
import sql from 'sql-template-strings'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const REFERRAL_LINK_VALIDATION_LIMIT_DEFAULTS = {
  rule_sets_per_program: 10,
  rules_per_rule_set: 50,
  rule_cursor_batch_size: 500,
}

/** Hard ceilings for referral program link validation limits. */
export const REFERRAL_LINK_VALIDATION_LIMIT_MAX_VALUES = {
  rule_sets_per_program: 50,
  rules_per_rule_set: 200,
  rule_cursor_batch_size: 5000,
}

export const referralLinkValidationLimitsConfig = new DynamicConfig({
  key: 'referral-link-validation-limits-config',
  fieldTypes: {
    rule_sets_per_program: 'number',
    rules_per_rule_set: 'number',
    rule_cursor_batch_size: 'number',
  },
  defaultFields: REFERRAL_LINK_VALIDATION_LIMIT_DEFAULTS,
})

export function getReferralLinkValidationLimit(
  field: keyof typeof REFERRAL_LINK_VALIDATION_LIMIT_DEFAULTS,
): number {
  return getBoundedPositiveIntegerField(referralLinkValidationLimitsConfig, field, {
    defaultValue: REFERRAL_LINK_VALIDATION_LIMIT_DEFAULTS[field],
    maxValue: REFERRAL_LINK_VALIDATION_LIMIT_MAX_VALUES[field],
  })
}

export async function assertReferralProgramRuleSetCapacity(
  referralProgramId: string,
  validationId: string,
  query: TransactionQuery,
): Promise<void> {
  const limit = getReferralLinkValidationLimit('rule_sets_per_program')
  const { rows } = await query<{ count: number; already_linked: boolean }>(sql`
    /* assertReferralProgramRuleSetCapacity */
    SELECT
      (
        SELECT count(*)::int
        FROM (
          SELECT 1
          FROM referral_program_topic_link_validation_rule_sets
          WHERE referral_program_topic_id = ${referralProgramId}
          ORDER BY referral_program_link_validation_rule_set_id
          LIMIT ${limit}
        ) capped
      ) AS count,
      EXISTS (
        SELECT 1
        FROM referral_program_topic_link_validation_rule_sets
        WHERE referral_program_topic_id = ${referralProgramId}
          AND referral_program_link_validation_rule_set_id = ${validationId}
      ) AS already_linked
  `)
  if (!rows[0]!.already_linked && rows[0]!.count >= limit) {
    throw createCodedError(
      409,
      'Referral program link validation rule set limit reached',
      REFERRAL_LINK_VALIDATION_RULE_SET_LIMIT_REACHED,
    )
  }
}

export async function assertReferralLinkValidationRuleCapacity(
  ruleSetId: string,
  query: TransactionQuery,
): Promise<void> {
  const limit = getReferralLinkValidationLimit('rules_per_rule_set')
  const { rows } = await query<{ count: number }>(sql`
    /* assertReferralLinkValidationRuleCapacity */
    SELECT count(*)::int AS count
    FROM (
      SELECT 1
      FROM referral_program_link_validation_rules
      WHERE referral_program_link_validation_rule_set_id = ${ruleSetId}
      ORDER BY id
      LIMIT ${limit}
    ) capped
  `)
  if (rows[0]!.count >= limit) {
    throw createCodedError(
      409,
      'Referral link validation rule limit reached',
      REFERRAL_LINK_VALIDATION_RULE_LIMIT_REACHED,
    )
  }
}
