import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createConfiguredAppleTransactionHistoryClient,
  fetchAppleTransactionHistory,
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

  it('uses authoritative history position and rejects absent submitted transactions', () => {
    expect(
      getLatestAuthoritativeAppleTransaction(
        ['oldest-signed-transaction', 'target-signed-transaction', 'newest-signed-transaction'],
        'target-signed-transaction',
      ),
    ).toEqual({ providerOrder: 2, signedTransactionInfo: 'newest-signed-transaction' })
    expect(() => getLatestAuthoritativeAppleTransaction(['other'], 'submitted')).toThrow(
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
})
