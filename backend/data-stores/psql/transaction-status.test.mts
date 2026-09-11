import { once } from 'node:events'
import pg, { type TransactionStatus } from 'pg'
import { describe, expect, it } from 'vitest'
import { resolveDatabaseConnectionString } from './connection-string-env.mts'
import { withLibpqCompat } from './connection-string-utils.mts'

type ObservableClient = pg.Client & { readonly readyForQuery: boolean }

describe('node-postgres transaction status', () => {
  it('reports failed state after ReadyForQuery and idle state after rollback', async () => {
    const client = new pg.Client({
      connectionString: withLibpqCompat(resolveDatabaseConnectionString()),
      connectionTimeoutMillis: 5_000,
      statement_timeout: 5_000,
    }) as ObservableClient
    let transactionOpen = false

    try {
      await client.connect()
      // oxlint-disable-next-line no-mistakes/postgres-no-manual-transaction -- this regression observes pg's raw transaction protocol lifecycle
      await client.query('/* transactionStatusBegin */ BEGIN')
      transactionOpen = true
      expect(client.getTransactionStatus()).toBe('T')

      const failedReadyForQuery = once(client.connection, 'readyForQuery')
      let statusAtError: TransactionStatus | undefined
      let readyAtError: boolean | undefined
      const queryError = await new Promise<Error>((resolve, reject) => {
        client.query('/* transactionStatusInvalidQuery */ SELECT missing_column', error => {
          if (!error) {
            reject(new Error('Expected the invalid query to fail'))
            return
          }
          statusAtError = client.getTransactionStatus()
          readyAtError = client.readyForQuery
          resolve(error)
        })
      })

      expect(queryError).toMatchObject({ code: '42703' })
      expect(statusAtError).toBe('T')
      expect(readyAtError).toBe(false)
      await failedReadyForQuery

      expect(client.getTransactionStatus()).toBe('E')

      // oxlint-disable-next-line no-mistakes/postgres-no-manual-transaction -- this regression observes pg's raw transaction protocol lifecycle
      await client.query('/* transactionStatusRollback */ ROLLBACK')
      transactionOpen = false
      expect(client.getTransactionStatus()).toBe('I')
    } finally {
      try {
        if (transactionOpen) {
          // oxlint-disable-next-line no-mistakes/postgres-no-manual-transaction -- cleanup must restore the directly managed test client
          await client.query('/* transactionStatusCleanup */ ROLLBACK')
        }
      } finally {
        await client.end()
      }
    }
  })
})
