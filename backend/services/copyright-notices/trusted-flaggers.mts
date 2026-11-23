import { beginTransaction } from '@data-stores/psql'
import { isUniqueViolation } from '@vouchington/postgres'
import { assertNotSuspended } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import createError from 'http-errors'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { flaggerRowsSql } from './trusted-flagger-rows-sql.mts'
import { currentUserCanApproveCopyrightJurisdictionPolicy } from './jurisdiction-policy.mts'
import {
  type CreateCopyrightTrustedFlaggerInput,
  validateTrustedFlaggerChangeReason,
  validateTrustedFlaggerInput,
} from './trusted-flagger-input.mts'
export type { CreateCopyrightTrustedFlaggerInput } from './trusted-flagger-input.mts'

type CopyrightTrustedFlaggerStatus = 'active' | 'suspended' | 'revoked'
export type CopyrightTrustedFlaggerChangeType = 'suspended' | 'reinstated' | 'revoked'
type CopyrightTrustedFlagger = {
  id: string
  name: string
  user_id: string | null
  awarding_coordinator_name: string
  awarding_member_state: string
  awarded_on: string
  award_reference: string | null
  area_of_expertise: 'intellectual_property' | 'other'
  area_description: string
  status: CopyrightTrustedFlaggerStatus
}
export type CopyrightTrustedFlaggerChange = {
  id: string
  copyright_trusted_flagger_id: string
  change_type: CopyrightTrustedFlaggerChangeType
  reason: string
  created_at: Date
}

export const copyrightTrustedFlaggerCursorScope = 'copyright-trusted-flaggers:id-desc'

type EntryRow = Omit<CopyrightTrustedFlagger, 'status'> & {
  latest_change_type: CopyrightTrustedFlaggerChangeType | null
}

export async function createCopyrightTrustedFlagger(
  currentUser: PrivateUser,
  input: CreateCopyrightTrustedFlaggerInput,
): Promise<CopyrightTrustedFlagger> {
  assertNotSuspended(currentUser)
  assert(currentUserCanApproveCopyrightJurisdictionPolicy(currentUser), 403, 'Forbidden')
  const validated = validateTrustedFlaggerInput(input)
  await using transaction = await beginTransaction()
  const { rows } = await transaction<Omit<CopyrightTrustedFlagger, 'status'>>(sql`
    /* createCopyrightTrustedFlagger */
    INSERT INTO copyright_trusted_flaggers (
      name, user_id, awarding_coordinator_name, awarding_member_state, awarded_on,
      award_reference, area_of_expertise, area_description, created_by_id
    ) SELECT
      ${validated.name}, ${input.userId}, ${validated.coordinator}, ${validated.memberState},
      ${validated.awardedAt}::date, ${validated.awardReference}, ${validated.areaOfExpertise},
      ${validated.areaDescription}, ${currentUser.id}
    FROM users WHERE id = ${input.userId} AND deleted_at IS NULL
    RETURNING id, name, user_id, awarding_coordinator_name, awarding_member_state,
      awarded_on::text AS awarded_on, award_reference, area_of_expertise, area_description
  `)
  const created = rows[0]
  assert(created, 422, 'user_id must name an active user')
  await transaction.commit()
  return { ...created, status: 'active' }
}

export async function recordCopyrightTrustedFlaggerChange(
  currentUser: PrivateUser,
  flaggerId: string,
  input: { changeType: CopyrightTrustedFlaggerChangeType; reason: string },
): Promise<CopyrightTrustedFlaggerChange> {
  assertNotSuspended(currentUser)
  assert(currentUserCanApproveCopyrightJurisdictionPolicy(currentUser), 403, 'Forbidden')
  const reason = validateTrustedFlaggerChangeReason(input.reason)
  assert(
    input.changeType === 'suspended' ||
      input.changeType === 'reinstated' ||
      input.changeType === 'revoked',
    422,
    'change_type is invalid',
  )
  try {
    await using transaction = await beginTransaction()
    const { rows: flaggers } = await transaction<{ id: string }>(sql`
      /* recordCopyrightTrustedFlaggerChange:flagger */
      SELECT id FROM copyright_trusted_flaggers WHERE id = ${flaggerId}
    `)
    assert(flaggers[0], 404, 'Trusted flagger not found')
    const { rows: latest } = await transaction<{
      id: string
      change_type: CopyrightTrustedFlaggerChangeType
    }>(sql`
      /* recordCopyrightTrustedFlaggerChange:latest */
      SELECT change.id, change.change_type FROM copyright_trusted_flagger_changes change
      WHERE change.copyright_trusted_flagger_id = ${flaggerId}
        AND NOT EXISTS (
          SELECT 1 FROM copyright_trusted_flagger_changes successor
          WHERE successor.copyright_trusted_flagger_id = change.copyright_trusted_flagger_id
            AND successor.previous_copyright_trusted_flagger_change_id = change.id
        )
      LIMIT 1
    `)
    const status: CopyrightTrustedFlaggerStatus =
      latest[0]?.change_type === 'suspended' || latest[0]?.change_type === 'revoked'
        ? latest[0].change_type
        : 'active'
    assert(
      (input.changeType === 'suspended' && status === 'active') ||
        (input.changeType === 'reinstated' && status === 'suspended') ||
        (input.changeType === 'revoked' && status !== 'revoked'),
      409,
      'Trusted flagger status does not allow this change',
    )
    const { rows: changes } = await transaction<CopyrightTrustedFlaggerChange>(sql`
      /* recordCopyrightTrustedFlaggerChange */
      INSERT INTO copyright_trusted_flagger_changes (
        copyright_trusted_flagger_id, previous_copyright_trusted_flagger_change_id,
        change_type, changed_by_id, reason
      ) VALUES (${flaggerId}, ${latest[0]?.id ?? null}, ${input.changeType}, ${currentUser.id}, ${reason})
      RETURNING id, copyright_trusted_flagger_id, change_type, reason, created_at
    `)
    const change = changes[0]
    assert(change, 500, 'Trusted flagger change was not recorded')
    await transaction.commit()
    return change
  } catch (err) {
    if (
      isUniqueViolation(err) &&
      'constraint' in err &&
      (err.constraint === 'idx_copyright_trusted_flagger_changes__first' ||
        err.constraint === 'idx_copyright_trusted_flagger_changes__successor')
    ) {
      throw createError(409, 'Trusted flagger status changed concurrently', { cause: err })
    }
    throw err
  }
}

export async function getCopyrightTrustedFlagger(
  currentUser: PrivateUser,
  flaggerId: string,
): Promise<CopyrightTrustedFlagger | null> {
  assertNotSuspended(currentUser)
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  await using transaction = await beginTransaction()
  const { rows } = await transaction<EntryRow>(
    flaggerRowsSql().append(sql`
    WHERE flagger.id = ${flaggerId} LIMIT 1
  `),
  )
  await transaction.commit()
  return rows[0] ? toTrustedFlagger(rows[0]) : null
}

export async function listCopyrightTrustedFlaggers(
  currentUser: PrivateUser,
  options: { limit: number; afterId?: string },
): Promise<{ results: CopyrightTrustedFlagger[]; hasNextPage: boolean }> {
  assertNotSuspended(currentUser)
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  assert(Number.isInteger(options.limit) && options.limit >= 1 && options.limit <= 100, 422)
  const query = flaggerRowsSql().append(sql` WHERE true`)
  if (options.afterId) query.append(sql` AND flagger.id < ${options.afterId}`)
  query.append(sql` ORDER BY flagger.id DESC LIMIT ${options.limit + 1}`)
  await using transaction = await beginTransaction()
  const { rows } = await transaction<EntryRow>(query)
  await transaction.commit()
  return {
    results: rows.slice(0, options.limit).map(toTrustedFlagger),
    hasNextPage: rows.length > options.limit,
  }
}

function toTrustedFlagger(row: EntryRow): CopyrightTrustedFlagger {
  const { latest_change_type, ...entry } = row
  return {
    ...entry,
    status:
      latest_change_type === 'suspended' || latest_change_type === 'revoked'
        ? latest_change_type
        : 'active',
  }
}
