import type { TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import { lockActiveUserSubjectsForMutation } from '@services/user-deletions/active-user-mutation-lock'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'

/** Retain account deletion and suspension writer fences before entity-specific locks. */
export async function lockActiveUserLifecycleForMutation(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  try {
    await lockActiveUserSubjectsForMutation(query, [userId])
  } catch (err) {
    if ((err as { code?: string }).code === '23514') throw createHttpError(401, 'User not found')
    throw err
  }
  await lockAuthorPublicationLifecycle(query, userId)
}
