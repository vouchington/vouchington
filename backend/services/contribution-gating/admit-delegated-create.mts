import type { TransactionQuery } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { CONTRIBUTION_ADMISSION_IN_PROGRESS, FORBIDDEN } from '@modules/on-error/error-codes'
import { validateUUID } from '@modules/utils'
import { runContributionAdmission } from './admission.mts'

/** The ledger routes of the keyed creates that make no post: each is one delegated MCP create. */
export type DelegatedCreateRoute =
  | 'communities.create'
  | 'reports.create'
  | 'disputes.create'
  | 'appeals.create'
  | 'communities.applications.create'

/**
 * Exactly-once create for a delegated credential owner on the entities that make no post
 * (community, report, dispute, appeal and community application). It shares the post admission
 * ledger: the actor's keys are one space, so a key reused on another route or with another
 * request is `IDEMPOTENCY_KEY_REUSED`. The create runs in the ledger's transaction and commits
 * with the stored response, so a stored response never lacks its entity and the reverse.
 * Callers validate and authorize first, so a refused request never claims a key. No contribution
 * quota applies; domain limits belong in `beforeCreate`, which a replay never reaches.
 */
export async function admitDelegatedCreate<T>(input: {
  authority: { kind: 'delegated'; credentialOwnerId: string }
  currentUser: { id: string }
  idempotencyKey: string
  route: DelegatedCreateRoute
  /** Closed scope the key is recorded under, e.g. `global` or `community:<community id>`. */
  scope: string
  /** Every argument except the key, so a changed request is detected. */
  intent: Record<string, unknown>
  /** Refusals that must not hold the key, evaluated after the claim and before the create. */
  beforeCreate?: () => Promise<void>
  /** Creates the entity and builds the response inside the ledger transaction. */
  execute: (query: TransactionQuery) => Promise<T>
}): Promise<T> {
  if (
    input.authority?.kind !== 'delegated' ||
    input.authority.credentialOwnerId !== input.currentUser.id
  )
    throw createCodedError(403, 'Delegated credential authority is required', FORBIDDEN)
  validateUUID(input.idempotencyKey)
  const admission = await runContributionAdmission({
    actorId: input.currentUser.id,
    idempotencyKey: input.idempotencyKey,
    callerCanReplayIdempotencyIdentity: true,
    intent: { route: input.route, ...input.intent },
    audit: {
      route: input.route,
      scope: input.scope,
      source: null,
      postType: null,
      policyRevision: null,
    },
    beforeCapacity: input.beforeCreate,
    execute: input.execute,
  })
  if (admission.kind === 'in_progress') {
    throw Object.assign(
      createCodedError(
        409,
        'This create is still being processed. Please retry.',
        CONTRIBUTION_ADMISSION_IN_PROGRESS,
      ),
      { retryAfterSeconds: admission.retryAfterSeconds },
    )
  }
  return admission.response
}
