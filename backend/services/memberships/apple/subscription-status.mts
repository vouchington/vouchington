import {
  AutoRenewStatus,
  Environment,
  Status,
  type StatusResponse,
} from '@apple/app-store-server-library'
import type {
  AppleMembershipObservation,
  AppleMembershipProviderEnvironment,
  AppleRenewalInfoVerifier,
  AppleTransactionVerifier,
} from './types.mts'
import type { AppleSubscriptionStatusClient } from './history.mts'

export { type AppleSubscriptionStatusClient } from './history.mts'

type AppleStatusExpectation = {
  applicationId: string
  environment: AppleMembershipProviderEnvironment
  providerLineageId: string
  providerProductId: string
}

type AppleSubscriptionStatus = Pick<
  AppleMembershipObservation,
  'autoRenews' | 'lifecycle' | 'terminalAt'
>

export async function fetchAppleSubscriptionStatuses(
  client: AppleSubscriptionStatusClient,
  transactionId: string,
): Promise<StatusResponse> {
  return client.getAllSubscriptionStatuses(transactionId)
}

export async function verifyAuthoritativeAppleSubscriptionStatus(options: {
  expected: AppleStatusExpectation
  latestTransaction: Awaited<ReturnType<AppleTransactionVerifier['verifyAndDecodeTransaction']>>
  statusResponse: StatusResponse
  verifier: AppleTransactionVerifier & AppleRenewalInfoVerifier
}): Promise<AppleSubscriptionStatus> {
  assertResponseContext(options.statusResponse, options.expected)
  const entry = await getStatusEntry(options)
  const renewal = await options.verifier.verifyAndDecodeRenewalInfo(entry.signedRenewalInfo)
  assertRenewalContext(renewal, options.expected)
  const lifecycle = getLifecycle(entry.status, options.latestTransaction)
  return {
    autoRenews: lifecycle.lifecycle === 'active' && renewal.autoRenewStatus === AutoRenewStatus.ON,
    ...lifecycle,
  }
}

async function getStatusEntry(options: {
  expected: AppleStatusExpectation
  latestTransaction: Awaited<ReturnType<AppleTransactionVerifier['verifyAndDecodeTransaction']>>
  statusResponse: StatusResponse
  verifier: AppleTransactionVerifier
}) {
  const entries =
    options.statusResponse.data
      ?.flatMap(group => group.lastTransactions ?? [])
      .reduce<
        Array<{
          signedRenewalInfo: string
          signedTransactionInfo: string
          status?: Status | number
        }>
      >((accepted, entry) => {
        if (
          entry.originalTransactionId === options.expected.providerLineageId &&
          entry.signedTransactionInfo &&
          entry.signedRenewalInfo
        )
          accepted.push({
            signedRenewalInfo: entry.signedRenewalInfo,
            signedTransactionInfo: entry.signedTransactionInfo,
            status: entry.status,
          })
        return accepted
      }, []) ?? []
  const matches = await Promise.all(
    entries.map(async entry => {
      const transaction = await options.verifier.verifyAndDecodeTransaction(
        entry.signedTransactionInfo!,
      )
      if (
        transaction.transactionId === options.latestTransaction.transactionId &&
        transaction.originalTransactionId === options.expected.providerLineageId &&
        transaction.productId === options.expected.providerProductId
      )
        return { status: entry.status, signedRenewalInfo: entry.signedRenewalInfo }
      return null
    }),
  )
  const matchesForLatestTransaction = matches.filter(
    (match): match is { signedRenewalInfo: string; status: Status | number | undefined } =>
      match !== null,
  )
  if (matchesForLatestTransaction.length === 1) return matchesForLatestTransaction[0]
  throw new Error('Apple subscription status did not include the authoritative transaction')
}

function assertResponseContext(response: StatusResponse, expected: AppleStatusExpectation) {
  if (
    response.bundleId !== expected.applicationId ||
    response.environment !== toAppleEnvironment(expected.environment)
  )
    throw new Error('Apple subscription status context did not match the provider evidence')
}

function assertRenewalContext(
  renewal: {
    environment?: Environment | string
    originalTransactionId?: string
    productId?: string
  },
  expected: AppleStatusExpectation,
) {
  if (
    renewal.environment !== toAppleEnvironment(expected.environment) ||
    renewal.originalTransactionId !== expected.providerLineageId ||
    renewal.productId !== expected.providerProductId
  )
    throw new Error('Apple signed renewal information did not match the provider evidence')
}

function getLifecycle(
  status: Status | number | undefined,
  transaction: { expiresDate?: number; revocationDate?: number },
): Omit<AppleSubscriptionStatus, 'autoRenews'> {
  const revocationDate = toDate(transaction.revocationDate)
  if (revocationDate || status === Status.REVOKED)
    return { lifecycle: 'revoked', terminalAt: revocationDate ?? requiredExpiry(transaction) }
  if (status === Status.EXPIRED)
    return { lifecycle: 'expired', terminalAt: requiredExpiry(transaction) }
  if (
    status === Status.ACTIVE ||
    status === Status.BILLING_RETRY ||
    status === Status.BILLING_GRACE_PERIOD
  )
    return { lifecycle: 'active', terminalAt: null }
  throw new Error('Apple subscription status was not recognized')
}

function requiredExpiry(transaction: { expiresDate?: number }): Date {
  const expiresAt = toDate(transaction.expiresDate)
  if (!expiresAt) throw new Error('Apple authoritative transaction omitted its expiry')
  return expiresAt
}

function toDate(value: number | undefined): Date | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? new Date(value)
    : null
}

function toAppleEnvironment(environment: AppleMembershipProviderEnvironment): Environment {
  return environment === 'test' ? Environment.SANDBOX : Environment.PRODUCTION
}
