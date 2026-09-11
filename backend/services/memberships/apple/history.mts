import {
  AppStoreServerAPIClient,
  Environment,
  GetTransactionHistoryVersion,
  Order,
  ProductType,
  type HistoryResponse,
  type TransactionHistoryRequest,
} from '@apple/app-store-server-library'
import type { AppleMembershipProviderEnvironment } from './types.mts'

const MAX_HISTORY_PAGES = 100

export type AppleTransactionHistoryClient = Pick<AppStoreServerAPIClient, 'getTransactionHistory'>
export type AppleSubscriptionStatusClient = Pick<
  AppStoreServerAPIClient,
  'getAllSubscriptionStatuses'
>

export type AppleTransactionHistoryClientConfig = {
  applicationId: string
  environment: AppleMembershipProviderEnvironment
  issuerId: string
  keyId: string
  privateKey: string
}

export function createAppleTransactionHistoryClient(
  config: AppleTransactionHistoryClientConfig,
): AppStoreServerAPIClient {
  return new AppStoreServerAPIClient(
    config.privateKey,
    config.keyId,
    config.issuerId,
    config.applicationId,
    config.environment === 'test' ? Environment.SANDBOX : Environment.PRODUCTION,
  )
}

export function createConfiguredAppleTransactionHistoryClient(options: {
  applicationId: string
  environment: AppleMembershipProviderEnvironment
}): AppStoreServerAPIClient {
  return createAppleTransactionHistoryClient({
    ...options,
    issuerId: getRequiredAppleServerApiConfig('APPLE_APP_STORE_SERVER_API_ISSUER_ID'),
    keyId: getRequiredAppleServerApiConfig('APPLE_APP_STORE_SERVER_API_KEY_ID'),
    privateKey: getRequiredAppleServerApiConfig('APPLE_APP_STORE_SERVER_API_PRIVATE_KEY'),
  })
}

export async function fetchAppleTransactionHistory(
  client: AppleTransactionHistoryClient,
  transactionId: string,
): Promise<string[]> {
  const request: TransactionHistoryRequest = {
    sort: Order.ASCENDING,
    productTypes: [ProductType.AUTO_RENEWABLE],
  }
  const transactions: string[] = []
  let revision: string | null = null
  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    // eslint-disable-next-line no-await-in-loop -- each page requires Apple's continuation token.
    const response: HistoryResponse = await client.getTransactionHistory(
      transactionId,
      revision,
      request,
      GetTransactionHistoryVersion.V2,
    )
    transactions.push(...(response.signedTransactions ?? []))
    if (!response.hasMore) return transactions
    if (!response.revision)
      throw new Error('Apple history response omitted its continuation revision')
    revision = response.revision
  }
  throw new Error(`Apple transaction history exceeded ${MAX_HISTORY_PAGES} pages`)
}

export function getAuthoritativeAppleTransactionOrder(
  signedTransactions: readonly string[],
  signedTransaction: string,
): number {
  const order = signedTransactions.indexOf(signedTransaction)
  if (order < 0) throw new Error('Apple transaction is absent from authoritative history')
  return order
}

export function getLatestAuthoritativeAppleTransaction(
  signedTransactions: readonly string[],
  submittedTransaction: string,
): { providerOrder: number; signedTransactionInfo: string } {
  getAuthoritativeAppleTransactionOrder(signedTransactions, submittedTransaction)
  const signedTransactionInfo = signedTransactions.at(-1)
  if (!signedTransactionInfo) throw new Error('Apple transaction history was empty')
  return { providerOrder: signedTransactions.length - 1, signedTransactionInfo }
}

function getRequiredAppleServerApiConfig(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for Apple App Store reconciliation`)
  return value
}
