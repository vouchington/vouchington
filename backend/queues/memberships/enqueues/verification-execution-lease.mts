import { randomInt, randomUUID } from 'node:crypto'
import { upsertValkeyClientByUrl } from 'valkyries'
import { unlinkIfValueMatches } from 'valkyries/conditional'
import { config } from '@data-stores/valkey-core/config'
import { workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  getMembershipVerificationConcurrency,
  MEMBERSHIP_VERIFICATION_LOCK_DURATION_MS,
} from '../config.mts'

const DEFAULT_NAMESPACE = `${workerQueuePrefix ?? 'glide'}:{memberships}:verification-execution`
const membershipVerificationLeaseClient = await upsertValkeyClientByUrl(config.worker_queue_url, {
  name: 'membership-verification-lease',
  readFrom: 'primary',
})

type SetOptions = NonNullable<Parameters<typeof membershipVerificationLeaseClient.set>[2]>
type SetExpiry = Exclude<SetOptions['expiry'], undefined>

export type MembershipVerificationExecutionLease = Readonly<{
  key: string
  token: string
}>

export async function acquireMembershipVerificationExecutionLease(
  namespace = DEFAULT_NAMESPACE,
): Promise<MembershipVerificationExecutionLease | null> {
  const token = randomUUID()
  const limit = getMembershipVerificationConcurrency()
  const start = randomInt(limit)
  for (let offset = 0; offset < limit; offset++) {
    const key = `${namespace}:slot:${(start + offset) % limit}`
    // oxlint-disable-next-line no-await-in-loop -- bounded semaphore admission probes at most 20 slots.
    const acquired = await membershipVerificationLeaseClient.set(key, token, {
      conditionalSet: 'onlyIfDoesNotExist',
      expiry: milliseconds(MEMBERSHIP_VERIFICATION_LOCK_DURATION_MS),
    })
    if (acquired !== null) return { key, token }
  }
  return null
}

export async function renewMembershipVerificationExecutionLease(
  lease: MembershipVerificationExecutionLease,
): Promise<boolean> {
  return (
    (await membershipVerificationLeaseClient.set(lease.key, lease.token, {
      conditionalSet: 'onlyIfEqual',
      comparisonValue: lease.token,
      expiry: milliseconds(MEMBERSHIP_VERIFICATION_LOCK_DURATION_MS),
    })) !== null
  )
}

export async function releaseMembershipVerificationExecutionLease(
  lease: MembershipVerificationExecutionLease,
): Promise<boolean> {
  return unlinkIfValueMatches(lease.key, lease.token, {
    client: membershipVerificationLeaseClient,
  })
}

function milliseconds(count: number): SetExpiry {
  return { type: 'PX', count } as SetExpiry
}
