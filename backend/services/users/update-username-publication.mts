import { beginTransaction, write } from '@data-stores/psql'
import { assertNever } from '@modules/utils/assert-never'
import {
  lockAuthorPublicationLifecycle,
  recordPostPublicationChange,
} from '@services/post-publication'

export type UserUpdateBody = {
  readonly text: string
  readonly values: readonly unknown[]
}

type UserUpdateOperation =
  | {
      readonly kind: 'fields'
      readonly body: UserUpdateBody
      readonly username: string | undefined
    }
  | { readonly kind: 'identity'; readonly body: UserUpdateBody; readonly username: string }

export async function commitUserUpdateOperation(userId: string, operation: UserUpdateOperation) {
  const { body, username } = operation
  if (operation.kind === 'fields' && username === undefined)
    return write(`/* updateUserFields */ ${body.text}`, body.values).then(() => undefined)
  await using query = await beginTransaction()
  await lockAuthorPublicationLifecycle(query, userId)
  let result: { rows: { previous_username: string | null }[] }
  switch (operation.kind) {
    case 'fields':
      result = await query<{ previous_username: string | null }>(
        `/* updateUserFields */ ${body.text}`,
        body.values,
      )
      break
    case 'identity':
      result = await query<{ previous_username: string | null }>(
        `/* updateUsername */ ${body.text}`,
        body.values,
      )
      break
    default:
      return assertNever(operation, 'Unknown user update operation')
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
