import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getEntityRelationTableNameOrThrow } from '@services/entity-relations/metadata'

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

const followTable = getEntityRelationTableNameOrThrow({
  subjectType: 'user',
  predicate: 'follow',
  objectType: 'user',
})

type RecipientUser = {
  id: string
  direct_messages_audience: string
}

type RecipientRelations = {
  id: string
  blocked_or_muted: boolean
  sender_follows: boolean
  recipient_follows: boolean
}

/**
 * True only when the sender may message every recipient. One set-based query returns, per
 * recipient: block or mute in either direction, whether the sender follows them, and whether they
 * follow the sender. The recipient's `direct_messages_audience` then decides.
 */
export async function currentUserCanMessageUsers(
  currentUserId: string,
  recipients: RecipientUser[],
): Promise<boolean> {
  if (recipients.length === 0) return true
  const query = sql`/* currentUserCanMessageUsers */
    SELECT r.id,
      (EXISTS (SELECT 1 FROM `
  query.append(blockTable)
  query.append(
    sql` b WHERE ((b.subject_id = ${currentUserId} AND b.object_id = r.id) OR (b.subject_id = r.id AND b.object_id = ${currentUserId})) AND b.deleted_at IS NULL)
        OR EXISTS (SELECT 1 FROM `,
  )
  query.append(muteTable)
  query.append(
    sql` m WHERE ((m.subject_id = ${currentUserId} AND m.object_id = r.id) OR (m.subject_id = r.id AND m.object_id = ${currentUserId})) AND m.deleted_at IS NULL)) AS blocked_or_muted,
      EXISTS (SELECT 1 FROM `,
  )
  query.append(followTable)
  query.append(
    sql` f WHERE f.subject_id = ${currentUserId} AND f.object_id = r.id AND f.deleted_at IS NULL) AS sender_follows,
      EXISTS (SELECT 1 FROM `,
  )
  query.append(followTable)
  query.append(
    sql` f WHERE f.subject_id = r.id AND f.object_id = ${currentUserId} AND f.deleted_at IS NULL) AS recipient_follows
    FROM unnest(${recipients.map(recipient => recipient.id)}::uuid[]) AS r(id)
  `,
  )
  const { rows } = await read<RecipientRelations>(query)
  const relationsById = new Map(rows.map(row => [row.id, row]))

  return recipients.every(recipient => {
    const relations = relationsById.get(recipient.id)
    if (!relations || relations.blocked_or_muted) return false
    switch (recipient.direct_messages_audience) {
      case 'everyone':
      case 'users':
        return true
      case 'followers':
        return relations.sender_follows
      case 'mutual_followers':
        return relations.sender_follows && relations.recipient_follows
      default:
        return false
    }
  })
}
