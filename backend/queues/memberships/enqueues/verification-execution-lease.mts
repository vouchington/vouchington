import { randomInt, randomUUID } from 'node:crypto'
import { upsertValkeyClientByUrl } from 'valkyries'
import { unlinkIfValueMatches } from 'valkyries/conditional'
import { config } from '@data-stores/valkey-core/config'
import { workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  getMembershipVerificationConcurrency,
  MEMBERSHIP_VERIFICATION_LOCK_DURATION_MS,
} from '../config.mts'

export const membershipVerificationLeaseNamespace = `${workerQueuePrefix ?? 'glide'}:{memberships}:verification-execution`

type LeaseClient = Awaited<ReturnType<typeof upsertValkeyClientByUrl>>
let leaseClientPromise: Promise<LeaseClient> | undefined

// Opened on first use so importing the enqueues never connects API or web processes.
function getLeaseClient(): Promise<LeaseClient> {
  leaseClientPromise ??= upsertValkeyClientByUrl(config.worker_queue_url, {
    name: 'membership-verification-lease',
    readFrom: 'primary',
  }).catch(err => {
    leaseClientPromise = undefined
    throw err
  })
  return leaseClientPromise
}

type SetOptions = NonNullable<Parameters<LeaseClient['set']>[2]>
type SetExpiry = Exclude<SetOptions['expiry'], undefined>

export type MembershipVerificationExecutionLease = Readonly<{
  key: string
  token: string
}>

export async function acquireMembershipVerificationExecutionLease(): Promise<MembershipVerificationExecutionLease | null> {
  const client = await getLeaseClient()
  const token = randomUUID()
  const limit = getMembershipVerificationConcurrency()
  const start = randomInt(limit)
  for (let offset = 0; offset < limit; offset++) {
    const key = `${membershipVerificationLeaseNamespace}:slot:${(start + offset) % limit}`
    // oxlint-disable-next-line no-await-in-loop -- bounded semaphore admission probes at most 20 slots.
    const acquired = await client.set(key, token, {
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
  const client = await getLeaseClient()
  return (
    (await client.set(lease.key, lease.token, {
      conditionalSet: 'onlyIfEqual',
      comparisonValue: lease.token,
      expiry: milliseconds(MEMBERSHIP_VERIFICATION_LOCK_DURATION_MS),
    })) !== null
  )
}

export async function releaseMembershipVerificationExecutionLease(
  lease: MembershipVerificationExecutionLease,
): Promise<boolean> {
  return unlinkIfValueMatches(lease.key, lease.token, { client: await getLeaseClient() })
}

function milliseconds(count: number): SetExpiry {
  return { type: 'PX', count } as SetExpiry
}
