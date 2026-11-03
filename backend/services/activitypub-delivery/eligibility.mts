import { withPrimaryReads } from '@data-stores/psql'
import { getActorPrivateKeyPem } from '@services/ap-actor-keys'
import { canDistributeActivityPubLike } from '@services/posts/activitypub-visibility'
import { isFederationEnabledForUser } from '@services/users'
import type { BuildActivityInput } from './types.mts'

type IneligibleReason = 'federation-disabled' | 'post-not-public'

// A false result permanently settles distribution recovery's source row. Replica lag or a stale
// post cache must not make a newly enabled federation preference or publication appear absent.
export function canDistributeOutboundActivity(data: BuildActivityInput): Promise<boolean> {
  return withPrimaryReads(async () => (await checkOutboundActivityEligibility(data)) === null)
}

// Delivery drops a job on a negative result. Resolve the actor key in the same primary scope as
// the opt-in and post policy; the caller sends HTTP only after this scope returns credentials.
export function getOutboundActivityDeliveryCredentials(
  data: BuildActivityInput,
): Promise<{ privateKeyPem: string } | { reason: IneligibleReason | 'missing-actor-keypair' }> {
  return withPrimaryReads(async () => {
    const reason = await checkOutboundActivityEligibility(data)
    if (reason) return { reason }
    const privateKeyPem = await getActorPrivateKeyPem(data.sourceUserId)
    if (!privateKeyPem) return { reason: 'missing-actor-keypair' as const }
    return { privateKeyPem }
  })
}

async function checkOutboundActivityEligibility(
  data: BuildActivityInput,
): Promise<IneligibleReason | null> {
  if (!(await isFederationEnabledForUser(data.sourceUserId))) return 'federation-disabled'

  // Follow/UndoFollow name a local target user. A target who never opted in must never be
  // disclosed, including by an Undo of a Follow that was previously suppressed.
  if (
    (data.activityType === 'Follow' || data.activityType === 'UndoFollow') &&
    !(await isFederationEnabledForUser(data.targetUserId))
  ) {
    return 'federation-disabled'
  }
  if (
    (data.activityType === 'Like' || data.activityType === 'UndoLike') &&
    !(await canDistributeActivityPubLike(data.targetPostId))
  ) {
    return 'post-not-public'
  }
  return null
}
