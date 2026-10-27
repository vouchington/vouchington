import {
  renewMembershipVerificationExecutionLease,
  type MembershipVerificationExecutionLease,
} from '@queues/memberships/enqueues/verification-execution-lease'

const LEASE_RENEWAL_INTERVAL_MS = 20_000

export async function runWithMembershipVerificationLeaseRenewal<T>(
  lease: MembershipVerificationExecutionLease,
  operation: () => Promise<T>,
): Promise<T> {
  let renewal: Promise<void> | undefined
  let renewalError: Error | undefined
  let ownershipLost = false
  const renewNow = async () => {
    if (renewal) return renewal
    renewal = (async () => {
      try {
        if (!(await renewMembershipVerificationExecutionLease(lease))) ownershipLost = true
      } catch (err) {
        ownershipLost = true
        renewalError =
          err instanceof Error
            ? err
            : new Error('Membership verification execution lease renewal failed', { cause: err })
      }
    })()
    try {
      await renewal
    } finally {
      renewal = undefined
    }
  }

  await renewNow()
  assertLeaseOwnership(ownershipLost, renewalError)
  const timer = setInterval(renewNow, LEASE_RENEWAL_INTERVAL_MS)
  timer.unref()
  let result: { value: T } | undefined
  let operationFailure: { error: unknown } | undefined
  try {
    try {
      result = { value: await operation() }
    } catch (err) {
      operationFailure = { error: err }
    }
    clearInterval(timer)
    await renewal
    assertLeaseOwnership(ownershipLost, renewalError)
    if (!operationFailure) {
      await renewNow()
      assertLeaseOwnership(ownershipLost, renewalError)
    }
  } finally {
    clearInterval(timer)
    await renewal
  }
  if (operationFailure) throw operationFailure.error
  if (!result) throw new Error('Membership verification operation returned no result')
  return result.value
}

function assertLeaseOwnership(ownershipLost: boolean, renewalError: Error | undefined): void {
  if (renewalError) throw renewalError
  if (ownershipLost) throw new Error('Membership verification execution lease lost ownership')
}
