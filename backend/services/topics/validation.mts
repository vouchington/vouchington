import assert from 'http-assert'
import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { validateUUID } from '@modules/utils'

type RewardsProgramStatusRecord = {
  id: string
  rewards_program_id: string | null
}

export const assertTopicExists = async (id: string, fieldName: string): Promise<void> => {
  validateUUID(id)
  const { rows } = await read(sql`/* assertTopicExists */
    SELECT id
    FROM topics
    WHERE id = ${id}
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL
    LIMIT 1
  `)
  assert(rows[0], 422, `${fieldName} must reference an existing topic`)
}

export const assertRewardsProgramExists = async (id: string, fieldName: string): Promise<void> => {
  validateUUID(id)
  const { rows } = await read(sql`/* assertRewardsProgramExists */
    SELECT rp.topic_id AS id
    FROM topics__rewards_programs rp
    JOIN topics t ON t.id = rp.topic_id
    WHERE rp.topic_id = ${id}
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
    LIMIT 1
  `)
  assert(rows[0], 422, `${fieldName} must reference an existing rewards program`)
}

export const assertReferralProgramExists = async (
  id: string,
  fieldName: string,
  options?: QueryOptions,
): Promise<void> => {
  validateUUID(id)
  const { rows } = await read(
    sql`/* assertReferralProgramExists */
    SELECT rp.topic_id AS id
    FROM topics__referral_programs rp
    JOIN topics t ON t.id = rp.topic_id
    WHERE rp.topic_id = ${id}
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
    LIMIT 1
  `,
    options,
  )
  assert(rows[0], 422, `${fieldName} must reference an existing referral program`)
}

export const assertRewardsProgramStatusExists = async (
  id: string,
  fieldName: string,
): Promise<RewardsProgramStatusRecord> => {
  validateUUID(id)
  const { rows } = await read(sql`/* assertRewardsProgramStatusExists */
    SELECT t.id, t.rewards_program_id
    FROM topics t
    JOIN topics__rewards_program_statuses rps ON rps.topic_id = t.id
    WHERE t.id = ${id}
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
    LIMIT 1
  `)
  const row = rows[0] as RewardsProgramStatusRecord | undefined
  assert(row, 422, `${fieldName} must reference an existing rewards program status`)
  return row
}

export const validateOptionalBoolean = (
  value: boolean | null | undefined,
  fieldName: string,
): void => {
  if (value === undefined || value === null) return
  assert(typeof value === 'boolean', 422, `${fieldName} must be a boolean`)
}

export const validateOptionalString = (
  value: string | null | undefined,
  fieldName: string,
): void => {
  if (value === undefined || value === null) return
  assert(typeof value === 'string', 422, `${fieldName} must be a string`)
}

export const validateOptionalTimestamp = (
  value: string | null | undefined,
  fieldName: string,
): void => {
  if (value === undefined || value === null) return
  assert(typeof value === 'string', 422, `${fieldName} must be a timestamp string`)
  assert(!Number.isNaN(Date.parse(value)), 422, `${fieldName} must be a valid timestamp`)
}

export const assertReferralLinkValidationExists = async (
  id: string,
  fieldName: string,
  options?: QueryOptions,
): Promise<void> => {
  validateUUID(id)
  const { rows } = await read(
    sql`/* assertReferralLinkValidationExists */
    SELECT id
    FROM referral_program_link_validations
    WHERE id = ${id}
    LIMIT 1
  `,
    options,
  )
  assert(rows[0], 422, `${fieldName} must reference an existing referral link validation`)
}
