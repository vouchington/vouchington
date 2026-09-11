import { read } from '@data-stores/psql'
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
export async function isUserBlockedOrMuted(userId1: string, userId2: string): Promise<boolean> {
  const query = sql`/* isUserBlockedOrMuted */ SELECT (EXISTS (SELECT 1 FROM `
  query.append(blockTable)
  query.append(
    sql` WHERE ((subject_id = ${userId1} AND object_id = ${userId2}) OR (subject_id = ${userId2} AND object_id = ${userId1})) AND deleted_at IS NULL) OR EXISTS (SELECT 1 FROM `,
  )
  query.append(muteTable)
  query.append(
    sql` WHERE ((subject_id = ${userId1} AND object_id = ${userId2}) OR (subject_id = ${userId2} AND object_id = ${userId1})) AND deleted_at IS NULL)) AS blocked`,
  )
  const { rows } = await read(query)
  return rows[0]?.blocked === true
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
