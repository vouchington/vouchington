import { createCaptureInputWithTextError } from '../../test-helpers/data-stores/psql/query-capture.mts'
import { afterEach, describe, expect, it } from 'vitest'
import type { QueryExecutor } from './types.mts'
import {
  captureTransactionQuery,
  clearCapturedQueries,
  disableQueryCapture,
  enableQueryCapture,
  runWithCapturedQueries,
} from './query-capture.mts'

describe('query capture failure isolation', () => {
  afterEach(() => {
    disableQueryCapture()
    clearCapturedQueries()
  })

  it.each(['readable', 'unreadable'])(
    'preserves executor and handler identities when input metadata errors are %s',
    async kind => {
      const reason = new Error('input metadata failed')
      if (kind === 'unreadable') {
        Object.defineProperty(reason, 'message', {
          get() {
            throw new Error('error message unavailable')
          },
        })
      }
      const input = createCaptureInputWithTextError(reason)
      const queryResult = { command: 'SELECT', rowCount: 1, oid: 0, fields: [], rows: [] }
      const original = Promise.resolve(queryResult)
      const handlerResult = { operation: 'captured' }
      let calls = 0
      const execute: QueryExecutor = () => {
        calls++
        return original
      }

      const diagnostics = await runWithCapturedQueries(async () => {
        const pending = captureTransactionQuery(execute)(input)
        expect(pending).toBe(original)
        expect(await pending).toBe(queryResult)
        return handlerResult
      })

      expect(calls).toBe(1)
      expect(diagnostics.result).toBe(handlerResult)
      expect(diagnostics.queries).toEqual([])
      expect(diagnostics.completedTransactions).toEqual([])
      expect(await diagnostics.completionDrain).toEqual(
        expect.arrayContaining([
          {
            name: 'Error',
            message: kind === 'readable' ? 'input metadata failed' : 'Unreadable diagnostic error',
          },
        ]),
      )
    },
  )

  it('retains legacy capture errors before invoking the executor outside scoped diagnostics', () => {
    const reason = new Error('legacy input metadata failed')
    const input = createCaptureInputWithTextError(reason)
    let calls = 0
    const execute: QueryExecutor = () => {
      calls++
      return Promise.resolve({ command: 'SELECT', rowCount: 0, oid: 0, fields: [], rows: [] })
    }
    enableQueryCapture()

    let thrown: unknown
    try {
      void captureTransactionQuery(execute)(input)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBe(reason)
    expect(calls).toBe(0)
  })
})
