import { beginTransaction, write } from '@data-stores/psql'
import type { SQLStatement } from 'sql-template-strings'
import {
  lockAuthorPublicationLifecycle,
  recordPostPublicationChange,
} from '@services/post-publication'

export async function commitUserUpdateOperation(
  userId: string,
  kind: 'fields' | 'identity',
  input: SQLStatement,
  username: string | undefined,
) {
  const text = input.text
  const values = [...input.values]
  if (kind === 'fields' && username === undefined)
    return write(`/* updateUserFields */ ${text}`, values).then(() => undefined)
  await using query = await beginTransaction()
  await lockAuthorPublicationLifecycle(query, userId)
  let result: { rows: { previous_username: string | null }[] }
  switch (kind) {
    case 'fields':
      result = await query<{ previous_username: string | null }>(
        `/* updateUserFields */ ${text}`,
        values,
      )
      break
    case 'identity':
      result = await query<{ previous_username: string | null }>(
        `/* updateUsername */ ${text}`,
        values,
      )
      break
  }
  const { rows } = result
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
