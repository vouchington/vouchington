import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { validateUUID } from '@modules/utils'
import type { PrivateUser } from '@services/users/types'
import type { Topic } from './types.mts'
import {
  assertReferralLinkValidationExists,
  assertReferralProgramExists,
  assertTopicExists,
  validateOptionalTimestamp,
} from './validation.mts'
import { currentUserCanUpdateTopic } from './authorization.mts'
import { upsertTopicAttributes } from './upsert-attributes.mts'
import { withReferralLinkEligibilityMutationLock } from '@services/entity-relations/referral-link-eligibility-lock'

type ReferralProgramAttributes = {
  company_id?: string | null
  enabled_at?: string | null
  disabled_at?: string | null
}

type ReferralProgramAttributesWithValidations = ReferralProgramAttributes & {
  referral_program_link_validation_ids?: string[] | null
}

export async function getReferralProgramAttributes(
  topic: Topic,
): Promise<ReferralProgramAttributesWithValidations | null> {
  assert(topic.topic_type === 'referral_program', 400, 'Topic is not a referral program')

  const { rows } = await read(sql`/* getReferralProgramAttributes */
    SELECT
      rp.company_id,
      rp.enabled_at,
      rp.disabled_at,
      COALESCE(
        array_agg(trplv.referral_program_link_validation_id ORDER BY trplv.referral_program_link_validation_id)
          FILTER (WHERE trplv.referral_program_link_validation_id IS NOT NULL),
        ARRAY[]::uuid[]
      ) AS referral_program_link_validation_ids
    FROM topics__referral_programs rp
    LEFT JOIN topics__referral_program_link_validations trplv
      ON trplv.referral_program_id = rp.topic_id
    WHERE rp.topic_id = ${topic.id}
    GROUP BY rp.topic_id
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function enableReferralProgram(
  topicId: string,
  companyId?: string | null,
): Promise<void> {
  const columns = ['enabled_at']
  const values: unknown[] = [new Date().toISOString()]
  if (companyId !== undefined) {
    columns.push('company_id')
    values.push(companyId ?? null)
  }
  await withReferralLinkEligibilityMutationLock({}, query =>
    upsertTopicAttributes<object>('topics__referral_programs', topicId, columns, values, {
      query,
    }),
  )
}

export async function linkValidationToReferralProgram(
  currentUser: PrivateUser | null,
  referralProgramId: string,
  validationId: string,
  options?: QueryOptions,
): Promise<void> {
  assert(currentUser, 401, 'Unauthorized')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  await assertReferralProgramExists(referralProgramId, 'referral_program_id', options)
  await assertReferralLinkValidationExists(validationId, 'validation_id', options)
  await withReferralLinkEligibilityMutationLock(options ?? {}, query =>
    query(sql`/* linkValidationToReferralProgram */
        INSERT INTO topics__referral_program_link_validations (referral_program_id, referral_program_link_validation_id)
        VALUES (${referralProgramId}, ${validationId})
        ON CONFLICT DO NOTHING
      `),
  )
}

export async function unlinkValidationFromReferralProgram(
  currentUser: PrivateUser | null,
  referralProgramId: string,
  validationId: string,
): Promise<void> {
  assert(currentUser, 401, 'Unauthorized')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')
  validateUUID(referralProgramId)
  validateUUID(validationId)

  await withReferralLinkEligibilityMutationLock({}, query =>
    query(sql`/* unlinkValidationFromReferralProgram */
        DELETE FROM topics__referral_program_link_validations
        WHERE referral_program_id = ${referralProgramId}
          AND referral_program_link_validation_id = ${validationId}
      `),
  )
}

export async function updateReferralProgramAttributes(
  currentUser: PrivateUser | null,
  topic: Topic,
  attributes: ReferralProgramAttributes,
): Promise<ReferralProgramAttributesWithValidations | null> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')
  assert(topic.topic_type === 'referral_program', 400, 'Topic is not a referral program')

  const columns: string[] = []
  const values: unknown[] = []

  if (
    attributes.enabled_at !== undefined &&
    attributes.disabled_at !== undefined &&
    attributes.enabled_at !== null &&
    attributes.disabled_at !== null
  ) {
    assert(false, 422, 'enabled_at and disabled_at cannot both be set')
  }

  if ('company_id' in attributes) {
    if (attributes.company_id != null) await assertTopicExists(attributes.company_id, 'company_id')
    columns.push('company_id')
    values.push(attributes.company_id ?? null)
  }
  if ('enabled_at' in attributes) {
    validateOptionalTimestamp(attributes.enabled_at, 'enabled_at')
    columns.push('enabled_at')
    values.push(attributes.enabled_at ?? null)
  }
  if ('disabled_at' in attributes) {
    validateOptionalTimestamp(attributes.disabled_at, 'disabled_at')
    columns.push('disabled_at')
    values.push(attributes.disabled_at ?? null)
  }

  return withReferralLinkEligibilityMutationLock({}, query =>
    upsertTopicAttributes<ReferralProgramAttributes>(
      'topics__referral_programs',
      topic.id,
      columns,
      values,
      { query },
    ),
  )
}
