import { beginTransaction, write, type QueryInput, type TransactionQuery } from '@data-stores/psql'
import {
  lockAuthorPublicationLifecycle,
  recordPostPublicationChange,
} from '@services/post-publication'

export async function commitUserFieldUpdate(
  userId: string,
  statement: QueryInput,
  validatedUsername: string | undefined,
): Promise<string | null | undefined> {
  if (validatedUsername === undefined) {
    await write(statement)
    return undefined
  }
  await using query = await beginTransaction()
  return await commitLockedUsernameChange(query, userId, statement, validatedUsername)
}

async function commitLockedUsernameChange(
  query: TransactionQuery,
  userId: string,
  statement: QueryInput,
  validatedUsername: string,
): Promise<string | null | undefined> {
  // Author deletion locks author:<userId> before the users row. Match that order.
  await lockAuthorPublicationLifecycle(query, userId)
  const { rows } = await query<{ previous_username: string | null }>(statement)
  const previousUsername = rows[0]?.previous_username ?? null
  if (rows.length > 0 && previousUsername !== validatedUsername) {
    // ast-grep-ignore: no-three-sequential-awaits -- the author advisory lock, locked username update, and publication capture commit together
    await recordUsernameChange(query, userId, previousUsername)
  }
  await query.commit()
  return rows.length > 0 ? previousUsername : undefined
}

async function recordUsernameChange(
  query: TransactionQuery,
  userId: string,
  previousUsername: string | null,
): Promise<void> {
  await recordPostPublicationChange(query, {
    scope: { type: 'author', authorUserId: userId },
    reason: 'author_username_changed',
    ...(previousUsername ? { footprint: { priorAuthorUsername: previousUsername } } : {}),
  })
}
