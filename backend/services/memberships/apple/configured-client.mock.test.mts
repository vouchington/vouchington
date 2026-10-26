import { afterEach, describe, expect, it, vi } from 'vitest'

const sdkCalls = vi.hoisted(() => ({
  constructorArgs: [] as unknown[][],
  historyArgs: [] as unknown[][],
}))

vi.mock<typeof import('@apple/app-store-server-library')>(
  import('@apple/app-store-server-library'),
  async importOriginal => {
    const actual = await importOriginal()
    return {
      ...actual,
      AppStoreServerAPIClient: class extends actual.AppStoreServerAPIClient {
        constructor(...args: ConstructorParameters<typeof actual.AppStoreServerAPIClient>) {
          super(...args)
          sdkCalls.constructorArgs.push(args)
        }

        override async getTransactionHistory(
          ...args: Parameters<typeof actual.AppStoreServerAPIClient.prototype.getTransactionHistory>
        ) {
          sdkCalls.historyArgs.push(args)
          return { signedTransactions: ['configured-history-transaction'], hasMore: false }
        }
      },
    }
  },
)

import {
  Environment,
  GetTransactionHistoryVersion,
  Order,
  ProductType,
} from '@apple/app-store-server-library'
import {
  createConfiguredAppleTransactionHistoryClient,
  fetchAppleTransactionHistory,
} from './history.mts'

describe('configured Apple transaction history client', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    sdkCalls.constructorArgs.length = 0
    sdkCalls.historyArgs.length = 0
  })

  it('passes configured app context to the SDK and fetches through its public method', async () => {
    const privateKey = 'synthetic-private-key'
    vi.stubEnv('APPLE_APP_STORE_SERVER_API_ISSUER_ID', 'synthetic-issuer')
    vi.stubEnv('APPLE_APP_STORE_SERVER_API_KEY_ID', 'synthetic-key')
    vi.stubEnv('APPLE_APP_STORE_SERVER_API_PRIVATE_KEY', privateKey)

    const client = createConfiguredAppleTransactionHistoryClient({
      applicationId: 'ai.voucha.ios',
      environment: 'test',
    })

    expect(sdkCalls.constructorArgs).toEqual([
      [privateKey, 'synthetic-key', 'synthetic-issuer', 'ai.voucha.ios', Environment.SANDBOX],
    ])
    await expect(fetchAppleTransactionHistory(client, 'transaction-id')).resolves.toEqual([
      'configured-history-transaction',
    ])
    expect(sdkCalls.historyArgs).toEqual([
      [
        'transaction-id',
        null,
        { sort: Order.ASCENDING, productTypes: [ProductType.AUTO_RENEWABLE] },
        GetTransactionHistoryVersion.V2,
      ],
    ])
  })
})
