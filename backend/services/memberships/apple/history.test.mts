import { generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAppleTransactionHistoryClient,
  createConfiguredAppleTransactionHistoryClient,
  fetchAppleTransactionHistory,
  getAuthoritativeAppleTransactionOrder,
  getLatestAuthoritativeAppleTransaction,
  type AppleTransactionHistoryClient,
} from './history.mts'

describe('Apple transaction history', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  it('fetches every ascending auto-renewable history page', async () => {
    const calls: Array<{ transactionId: string; revision: string | null; request: unknown }> = []
    const client: AppleTransactionHistoryClient = {
      async getTransactionHistory(transactionId, revision, request) {
        calls.push({ transactionId, revision, request })
        return revision === null
          ? { signedTransactions: ['first'], hasMore: true, revision: 'next-page' }
          : { signedTransactions: ['second'], hasMore: false }
      },
    }

    await expect(fetchAppleTransactionHistory(client, 'original-transaction')).resolves.toEqual([
      'first',
      'second',
    ])
    expect(calls).toEqual([
      {
        transactionId: 'original-transaction',
        revision: null,
        request: { sort: 'ASCENDING', productTypes: ['AUTO_RENEWABLE'] },
      },
      {
        transactionId: 'original-transaction',
        revision: 'next-page',
        request: { sort: 'ASCENDING', productTypes: ['AUTO_RENEWABLE'] },
      },
    ])
  })

  it('derives order from the verified transaction position, never its timestamp', () => {
    expect(
      getAuthoritativeAppleTransactionOrder(
        ['oldest-signed-transaction', 'target-signed-transaction', 'newest-signed-transaction'],
        'target-signed-transaction',
      ),
    ).toBe(1)
  })

  it('rejects a submitted transaction absent from authoritative history', () => {
    expect(() => getAuthoritativeAppleTransactionOrder(['other'], 'submitted')).toThrow(
      'Apple transaction is absent from authoritative history',
    )
  })

  it('converges a stale notification onto the latest history transaction', () => {
    expect(
      getLatestAuthoritativeAppleTransaction(
        ['submitted-old-transaction', 'latest-transaction'],
        'submitted-old-transaction',
      ),
    ).toEqual({ providerOrder: 1, signedTransactionInfo: 'latest-transaction' })
  })

  it('requires worker-only App Store Server API credentials', () => {
    expect(() =>
      createConfiguredAppleTransactionHistoryClient({
        applicationId: 'ai.voucha.ios',
        environment: 'test',
      }),
    ).toThrow('APPLE_APP_STORE_SERVER_API_ISSUER_ID is required')
  })

  it('fails closed on incomplete or unbounded history pagination', async () => {
    const missingRevision: AppleTransactionHistoryClient = {
      async getTransactionHistory() {
        return { signedTransactions: [], hasMore: true }
      },
    }
    const endlessPages: AppleTransactionHistoryClient = {
      async getTransactionHistory() {
        return { signedTransactions: [], hasMore: true, revision: 'again' }
      },
    }

    await expect(fetchAppleTransactionHistory(missingRevision, 'original')).rejects.toThrow(
      'Apple history response omitted its continuation revision',
    )
    await expect(fetchAppleTransactionHistory(endlessPages, 'original')).rejects.toThrow(
      'Apple transaction history exceeded 100 pages',
    )
  })

  it('signs sandbox requests with the configured credentials and bundle context', async () => {
    const privateKey = createTestAppleSigningKey()
    const directClient = createAppleTransactionHistoryClient({
      applicationId: 'ai.voucha.ios',
      environment: 'test',
      issuerId: 'issuer-id',
      keyId: 'key-id',
      privateKey,
    })
    vi.stubEnv('APPLE_APP_STORE_SERVER_API_ISSUER_ID', 'issuer-id')
    vi.stubEnv('APPLE_APP_STORE_SERVER_API_KEY_ID', 'key-id')
    vi.stubEnv('APPLE_APP_STORE_SERVER_API_PRIVATE_KEY', privateKey)
    const configuredClient = createConfiguredAppleTransactionHistoryClient({
      applicationId: 'ai.voucha.ios',
      environment: 'test',
    })
    const requests: Array<{ headers: Record<string, string>; path: string; urlBase: string }> = []
    for (const client of [directClient, configuredClient]) {
      Object.defineProperty(client, 'makeFetchRequest', {
        configurable: true,
        value: async function (
          path: string,
          _query: unknown,
          _method: unknown,
          _body: unknown,
          headers: Record<string, string>,
        ) {
          requests.push({
            headers,
            path,
            urlBase: (this as unknown as { urlBase: string }).urlBase,
          })
          return { ok: false, status: 401, json: async () => ({}) }
        },
      })
    }

    await expect(
      directClient.getTransactionHistory('transaction-id', null, { productTypes: [] }),
    ).rejects.toMatchObject({ httpStatusCode: 401 })
    await expect(
      configuredClient.getAllSubscriptionStatuses('transaction-id'),
    ).rejects.toMatchObject({
      httpStatusCode: 401,
    })
    expect(requests).toHaveLength(2)
    for (const request of requests) {
      expect(request.urlBase).toBe('https://api.storekit-sandbox.apple.com')
      expect(request.path).toMatch(/^\/inApps\/v1\//)
      expect(request.headers.Authorization).toMatch(/^Bearer /)
      expect(decodeAppleServerApiBearer(request.headers.Authorization)).toMatchObject({
        header: { kid: 'key-id' },
        payload: { bid: 'ai.voucha.ios', iss: 'issuer-id' },
      })
    }
  })
})

function createTestAppleSigningKey(): string {
  return generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    .privateKey.export({ format: 'pem', type: 'pkcs8' })
    .toString()
}

function decodeAppleServerApiBearer(authorization: string): {
  header: Record<string, unknown>
  payload: Record<string, unknown>
} {
  const token = authorization.replace(/^Bearer /, '')
  const [encodedHeader, encodedPayload] = token.split('.')
  if (!encodedHeader || !encodedPayload) throw new Error('Apple API client did not sign a JWT')
  return {
    header: JSON.parse(Buffer.from(encodedHeader, 'base64url').toString()) as Record<
      string,
      unknown
    >,
    payload: JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as Record<
      string,
      unknown
    >,
  }
}
