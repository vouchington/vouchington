import type { TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import { lockActiveUserSubjectsForMutation } from '@services/user-deletions/active-user-mutation-lock'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import { assertDelegatedPostActorActive } from './authorization.mts'

/** Retain deletion and suspension writer fences through the delegated contribution commit. */
export async function lockDelegatedPostActor(
  query: TransactionQuery,
  actorId: string,
): Promise<void> {
  try {
    await lockActiveUserSubjectsForMutation(query, [actorId])
  } catch (err) {
    if ((err as { code?: string }).code === '23514') throw createHttpError(401, 'User not found')
    throw err
  }
  await lockAuthorPublicationLifecycle(query, actorId)
  await assertDelegatedPostActorActive(actorId, { query })
}
