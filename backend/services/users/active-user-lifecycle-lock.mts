import type { TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import { lockActiveUserSubjectsForMutation } from '@services/user-deletions/active-user-mutation-lock'
import { lockAuthorPublicationLifecycles } from '@services/post-publication'

export { lockUserSubjectMutationFences } from '@services/user-deletions/active-user-mutation-lock'

/** Retain account deletion and suspension writer fences before entity-specific locks. */
export async function lockActiveUserLifecycleForMutation(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  await lockActiveUserLifecyclesForMutation(query, [userId])
}

/** Fences every user in ascending id order, deletion writer fences first. */
export async function lockActiveUserLifecyclesForMutation(
  query: TransactionQuery,
  userIds: readonly string[],
): Promise<void> {
  try {
    await lockActiveUserSubjectsForMutation(query, userIds)
  } catch (err) {
    if (['23514', 'P0002'].includes((err as { code?: string }).code ?? ''))
      throw createHttpError(401, 'User not found')
    throw err
  }
  await lockAuthorPublicationLifecycles(query, userIds)
}
