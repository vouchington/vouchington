import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getEntityRelationTableNameOrThrow } from './metadata.mts'

const blockTable = getEntityRelationTableNameOrThrow({
  subjectType: 'user',
  predicate: 'block',
  objectType: 'user',
})

const muteTable = getEntityRelationTableNameOrThrow({
  subjectType: 'user',
  predicate: 'mute',
  objectType: 'user',
})

/**
 * Returns true if either user has blocked or muted the other.
 * Used to suppress notifications between users with a block/mute relation.
 */
export async function areUsersBlockedOrMutedEitherWay(
  userId1: string,
  userId2: string,
  options: QueryOptions = {},
): Promise<boolean> {
  const query = sql`/* areUsersBlockedOrMutedEitherWay */ SELECT (EXISTS (SELECT 1 FROM `
  query.append(blockTable)
  query.append(
    sql` WHERE ((subject_id = ${userId1} AND object_id = ${userId2}) OR (subject_id = ${userId2} AND object_id = ${userId1})) AND deleted_at IS NULL) OR EXISTS (SELECT 1 FROM `,
  )
  query.append(muteTable)
  query.append(
    sql` WHERE ((subject_id = ${userId1} AND object_id = ${userId2}) OR (subject_id = ${userId2} AND object_id = ${userId1})) AND deleted_at IS NULL)) AS blocked`,
  )
  // A caller inside a writer transaction must see its own snapshot, not a lagging replica.
  const { rows } = await (options.query ? write : read)(query, options)
  return rows[0]?.blocked === true
}

/** Returns recipients with a live block or mute relation to the sender in either direction. */
export async function getUserIdsBlockedOrMutedEitherWay(
  senderId: string,
  recipientIds: string[],
): Promise<Set<string>> {
  if (recipientIds.length === 0) return new Set()
  const query = sql`/* getUserIdsBlockedOrMutedEitherWay */ SELECT user_id FROM (
    SELECT CASE WHEN subject_id = ${senderId} THEN object_id ELSE subject_id END AS user_id FROM `
  query.append(blockTable)
  query.append(
    sql` WHERE ((subject_id = ${senderId} AND object_id = ANY(${recipientIds}::uuid[])) OR (object_id = ${senderId} AND subject_id = ANY(${recipientIds}::uuid[]))) AND deleted_at IS NULL
    UNION SELECT CASE WHEN subject_id = ${senderId} THEN object_id ELSE subject_id END AS user_id FROM `,
  )
  query.append(muteTable)
  query.append(
    sql` WHERE ((subject_id = ${senderId} AND object_id = ANY(${recipientIds}::uuid[])) OR (object_id = ${senderId} AND subject_id = ANY(${recipientIds}::uuid[]))) AND deleted_at IS NULL
    ) blocked_or_muted`,
  )
  const { rows } = await read<{ user_id: string }>(query)
  return new Set(rows.map(row => row.user_id))
}

/**
 * Returns true if currentUserId has a block or mute relationship (in either direction)
 * with any user in otherIds. Two DB round-trips (one per table) instead of N.
 */
export async function isAnyUserBlockedOrMuted(
  currentUserId: string,
  otherIds: string[],
): Promise<boolean> {
  if (otherIds.length === 0) return false
  const query = sql`/* isAnyUserBlockedOrMuted */ SELECT EXISTS (SELECT 1 FROM `
  query.append(blockTable)
  query.append(
    sql` WHERE ((subject_id = ${currentUserId} AND object_id = ANY(${otherIds}::uuid[])) OR (object_id = ${currentUserId} AND subject_id = ANY(${otherIds}::uuid[]))) AND deleted_at IS NULL UNION ALL SELECT 1 FROM `,
  )
  query.append(muteTable)
  query.append(
    sql` WHERE ((subject_id = ${currentUserId} AND object_id = ANY(${otherIds}::uuid[])) OR (object_id = ${currentUserId} AND subject_id = ANY(${otherIds}::uuid[]))) AND deleted_at IS NULL) AS blocked`,
  )
  const { rows } = await read(query)
  return rows[0]?.blocked === true
}

/**
 * Returns true if any pair within userIds has a block or mute relationship.
 * Used for group conversation pre-flight checks.
 */
export async function anyPairAmongUsersBlockedOrMuted(userIds: string[]): Promise<boolean> {
  if (userIds.length < 2) return false
  const query = sql`/* anyPairAmongUsersBlockedOrMuted */ SELECT EXISTS (SELECT 1 FROM `
  query.append(blockTable)
  query.append(
    sql` WHERE subject_id = ANY(${userIds}::uuid[]) AND object_id = ANY(${userIds}::uuid[]) AND subject_id != object_id AND deleted_at IS NULL UNION ALL SELECT 1 FROM `,
  )
  query.append(muteTable)
  query.append(
    sql` WHERE subject_id = ANY(${userIds}::uuid[]) AND object_id = ANY(${userIds}::uuid[]) AND subject_id != object_id AND deleted_at IS NULL) AS blocked`,
  )
  const { rows } = await read(query)
  return rows[0]?.blocked === true
}
