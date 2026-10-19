import { beginTransaction, write, type QueryInput } from '@data-stores/psql'
import {
  lockAuthorPublicationLifecycle,
  recordPostPublicationChange,
} from '@services/post-publication'

export async function commitUserFieldUpdate(userId: string, input: QueryInput, username?: string) {
  if (username === undefined) return write(input).then(() => undefined)
  await using query = await beginTransaction()
  await lockAuthorPublicationLifecycle(query, userId)
  const { rows } = await query<{ previous_username: string | null }>(input)
  const previousUsername = rows[0]?.previous_username ?? null
  const changed = rows.length > 0 && previousUsername !== username
  const scope = { type: 'author' as const, authorUserId: userId }
  const reason = 'author_username_changed' as const
  const footprint = previousUsername ? { priorAuthorUsername: previousUsername } : undefined
  const publication = { scope, reason, ...(footprint ? { footprint } : {}) }
  if (changed) await recordPostPublicationChange(query, publication)
  await query.commit()
  return rows.length > 0 ? previousUsername : undefined
}
