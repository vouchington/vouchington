import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { validateUUID } from '@modules/utils/ids'
import type { PrivateUser } from '@services/users/types'
import type {
  HouseholdRow,
  HouseholdListOptions,
  HouseholdMembershipListOptions,
} from '../types.mts'
import { buildPageInfo, decodeScopedPreciseTimestampCursor } from '@modules/pagination'
import {
  isAuthorizedHouseholdMembershipCursorRow,
  type HouseholdMembershipPageSqlRow,
} from './household-membership-page-row.mts'

type HouseholdCursorRow = HouseholdRow & { cursor_updated_at: string }

export async function getHouseholdsByUser(
  currentUser: PrivateUser | null,
  options: HouseholdListOptions,
) {
  assert(currentUser, 401, 'User not logged in')
  const cursorScope = getHouseholdCursorScope(currentUser.id, options.access)
  const after = options.after
    ? decodeScopedPreciseTimestampCursor(options.after, cursorScope, 'Invalid household cursor')
    : undefined
  const query = sql`/* getHouseholdsByUser */
    WITH accessible_households AS (`
  if (options.access === 'owned' || options.access === 'all') {
    query.append(sql`
      SELECT h.id, h.owner_id, h.updated_at
      FROM households h
      WHERE h.owner_id = ${currentUser.id}`)
  }
  if (options.access === 'all') query.append(sql` UNION ALL `)
  if (options.access === 'member' || options.access === 'all') {
    query.append(sql`
      SELECT h.id, h.owner_id, h.updated_at
      FROM household_members access_membership
      JOIN households h ON h.id = access_membership.household_id
      WHERE access_membership.individual_id = ${currentUser.individual_id}::uuid
        AND h.owner_id != ${currentUser.id}`)
  }
  query.append(sql`
    )
    SELECT
      h.id,
      h.owner_id,
      h.updated_at,
      to_char(
        h.updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS cursor_updated_at
    FROM accessible_households h
    WHERE TRUE`)
  if (after) {
    query.append(sql`
      AND (h.updated_at, h.id) < (${after.timestamp}::timestamptz, ${after.id})`)
  }
  query.append(sql`
    ORDER BY h.updated_at DESC, h.id DESC
    LIMIT ${options.limit + 1}`)

  const { rows } = await read<HouseholdCursorRow>(query)
  const hasNextPage = rows.length > options.limit
  const cursorRows = rows.slice(0, options.limit)
  const results = cursorRows.map(({ cursor_updated_at: _, ...household }) => household)
  return {
    results,
    page_info: buildPageInfo(cursorRows, {
      hasNextPage,
      getCursor: household => ({
        timestamp: household.cursor_updated_at,
        id: household.id,
        scope: cursorScope,
      }),
    }),
  }
}

export async function getHouseholdMemberships(
  currentUser: PrivateUser | null,
  householdId: string,
  options: HouseholdMembershipListOptions,
) {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(householdId)
  const cursorScope = getHouseholdMembershipCursorScope(householdId)
  const after = options.after
    ? decodeScopedPreciseTimestampCursor(
        options.after,
        cursorScope,
        'Invalid household membership cursor',
      )
    : undefined
  const query = sql`/* getHouseholdMemberships */
    WITH access_check AS (
      SELECT
        authorized_household.id IS NOT NULL AS household_exists,
        authorized_household.id IS NOT NULL AND (
          ${currentUser.roles.includes('administrator')}
          OR authorized_household.owner_id = ${currentUser.id}
          OR (
            ${currentUser.individual_id}::uuid IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM household_members authorized_membership
              WHERE authorized_membership.household_id = authorized_household.id
                AND authorized_membership.individual_id = ${currentUser.individual_id}::uuid
            )
          )
        ) AS can_view
      FROM (VALUES (TRUE)) singleton(singleton_value)
      LEFT JOIN households authorized_household ON authorized_household.id = ${householdId}
    )
    SELECT
      hm.id,
      hm.household_id,
      hm.relationship,
      to_char(
        hm.updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS updated_at,
      to_char(
        hm.updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS cursor_updated_at,
      json_build_object(
        'id', i.id,
        'user_id', u.id,
        'username', u.username,
        'updated_at', i.updated_at
      ) AS individual,
      access_check.household_exists,
      access_check.can_view
    FROM access_check
    LEFT JOIN LATERAL (
      SELECT member.id, member.household_id, member.individual_id, member.relationship,
        member.updated_at
      FROM household_members member
      WHERE member.household_id = ${householdId}`
  if (after) {
    query.append(sql`
        AND (member.updated_at, member.id) < (${after.timestamp}::timestamptz, ${after.id})`)
  }
  query.append(sql`
      ORDER BY member.updated_at DESC, member.id DESC
      LIMIT ${options.limit + 1}
    ) hm ON access_check.can_view
    LEFT JOIN individuals i ON i.id = hm.individual_id
    LEFT JOIN users u ON u.individual_id = i.id
    ORDER BY hm.updated_at DESC NULLS LAST, hm.id DESC NULLS LAST`)

  const { rows } = await write<HouseholdMembershipPageSqlRow>(query)
  const firstRow = rows[0]
  assert(firstRow, 500, 'Invalid household membership page')
  assert(firstRow.household_exists, 404, 'Household not found')
  assert(firstRow.can_view, 403, 'Forbidden')
  assert(
    rows.every(row => row.id === null || isAuthorizedHouseholdMembershipCursorRow(row)),
    500,
    'Invalid household membership row',
  )
  const membershipRows = rows.filter(isAuthorizedHouseholdMembershipCursorRow)
  const hasNextPage = membershipRows.length > options.limit
  const cursorRows = membershipRows.slice(0, options.limit)
  const results = cursorRows.map(
    ({ cursor_updated_at: _, household_exists: __, can_view: ___, ...membership }) => membership,
  )
  return {
    results,
    page_info: buildPageInfo(cursorRows, {
      hasNextPage,
      getCursor: membership => ({
        timestamp: membership.cursor_updated_at,
        id: membership.id,
        scope: cursorScope,
      }),
    }),
  }
}

function getHouseholdCursorScope(currentUserId: string, access: string): string {
  return `households:${currentUserId}:access=${access}:updated_at-desc,id-desc`
}

function getHouseholdMembershipCursorScope(householdId: string): string {
  return `household-memberships:${householdId}:updated_at-desc,id-desc`
}
