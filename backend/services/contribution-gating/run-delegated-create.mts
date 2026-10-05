import { createCodedError } from '@modules/on-error/create-coded-error'
import { CONTRIBUTION_ADMISSION_IN_PROGRESS, FORBIDDEN } from '@modules/on-error/error-codes'
import { validateUUID } from '@modules/utils'
import { hashAdmissionIntent } from './admission-intent.mts'
import {
  claimDelegatedCreate,
  completeDelegatedCreate,
  releaseDelegatedCreate,
} from './delegated-create-attempts.mts'

/**
 * Exactly-once create for a delegated credential owner on the entities that have no post to bind
 * admission to (community, report, dispute, appeal and community application). Callers validate
 * and authorize first, so a refused request never claims a key. The credential replaces the
 * interactive challenge; quotas and domain rules stay in `execute`, so a replay consumes neither.
 */
export async function runDelegatedCreate<T extends Record<string, unknown>>(input: {
  authority: { kind: 'delegated'; credentialOwnerId: string }
  currentUser: { id: string }
  idempotencyKey: string
  /** Names the tool and carries every argument except the key, so a changed request is detected. */
  intent: unknown
  execute: () => Promise<T>
}): Promise<T> {
  if (
    input.authority?.kind !== 'delegated' ||
    input.authority.credentialOwnerId !== input.currentUser.id
  )
    throw createCodedError(403, 'Delegated credential authority is required', FORBIDDEN)
  validateUUID(input.idempotencyKey)
  const claim = await claimDelegatedCreate(
    input.currentUser.id,
    input.idempotencyKey,
    hashAdmissionIntent(input.intent),
  )
  if (claim.kind === 'replay') return claim.response as T
  if (claim.kind === 'in_progress') {
    throw Object.assign(
      createCodedError(
        409,
        'This create is still being processed. Please retry.',
        CONTRIBUTION_ADMISSION_IN_PROGRESS,
      ),
      { retryAfterSeconds: claim.retryAfterSeconds },
    )
  }
  try {
    const response = await input.execute()
    await completeDelegatedCreate(claim.id, response)
    return response
  } catch (err) {
    await releaseDelegatedCreate(claim.id)
    throw err
  }
}
