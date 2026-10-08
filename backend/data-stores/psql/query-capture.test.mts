import { afterEach, describe, expect, it } from 'vitest'
import type { QueryExecutor } from './types.mts'
import { stopTestQueryCapture, withCapturedTestQueries } from '../../test-helpers/query-capture.mts'
import {
  captureTransactionQuery,
  type QueryCompletion,
  clearCapturedQueries,
  disableQueryCapture,
  enableQueryCapture,
  getCapturedQueries,
  runWithCapturedQueries,
} from './query-capture.mts'
import {
  captureAnnotatedQuery,
  captureQueryAfterDisable,
  captureQueryAfterStop,
  captureQueryBeforeStop,
  captureQueryFromPriorCapture,
  captureQueryInsideOperation,
  captureQueryOutsideOperation,
  captureSqlTemplateQuery,
  captureStringQuery,
  captureUncloneableValuesQuery,
  captureUnsupportedQueryInput,
} from '../../test-helpers/data-stores/psql/query-capture.mts'
describe('query capture', () => {
  afterEach(() => {
    disableQueryCapture()
    clearCapturedQueries()
  })
  it('ignores queries until capture is enabled', () => {
    captureQueryAfterDisable()
    expect(getCapturedQueries()).toEqual([])
  })
  it('records strings, SQL statements, and ignores unknown input', () => {
    enableQueryCapture()
    captureStringQuery()
    captureSqlTemplateQuery()
    captureUnsupportedQueryInput()
    expect(getCapturedQueries()).toEqual([
      expect.objectContaining({ text: '/* fromString */ SELECT $1', values: [1] }),
      expect.objectContaining({ text: expect.stringContaining('/* fromSql */ SELECT') }),
    ])
    disableQueryCapture()
    captureQueryAfterDisable()
    expect(getCapturedQueries()).toHaveLength(2)
    clearCapturedQueries()
    expect(getCapturedQueries()).toEqual([])
  })
  it('stops test capture with a returned snapshot and no residual state', () => {
    enableQueryCapture()
    captureQueryBeforeStop()
    const capturedBeforeStop = getCapturedQueries()
    const stoppedQueries = stopTestQueryCapture()
    expect(stoppedQueries).toEqual([
      expect.objectContaining({ text: '/* capturedBeforeStop */ SELECT $1', values: [1] }),
    ])
    expect(stoppedQueries[0]).not.toBe(capturedBeforeStop[0])
    expect(stoppedQueries[0]?.values).not.toBe(capturedBeforeStop[0]?.values)
    expect(getCapturedQueries()).toEqual([])
    captureQueryAfterStop()
    expect(getCapturedQueries()).toEqual([])
  })
  it('records only the profiled async context', async () => {
    enableQueryCapture()
    let releaseSibling = () => {}
    const sibling = (async () => {
      await new Promise<void>(resolve => {
        releaseSibling = resolve
      })
      captureAnnotatedQuery('sibling')
    })()
    const { queries } = await runWithCapturedQueries(async () => {
      releaseSibling()
      await sibling
      captureAnnotatedQuery('inside')
    })
    expect(queries.map(query => query.text)).toEqual(['/* inside */ SELECT 1'])
    expect(getCapturedQueries().map(query => query.text)).toEqual(['/* sibling */ SELECT 1'])
  })
  it('disables and clears capture when snapshot cloning fails', () => {
    const values = new Proxy([1], {
      get(target, property, receiver) {
        if (property === Symbol.iterator) throw new Error('values clone failed')
        return Reflect.get(target, property, receiver)
      },
    })
    enableQueryCapture()
    captureUncloneableValuesQuery(values)
    expect(() => stopTestQueryCapture()).toThrow('values clone failed')
    expect(getCapturedQueries()).toEqual([])
    captureQueryAfterStop()
    expect(getCapturedQueries()).toEqual([])
  })
  it('omits queries scheduled outside the captured operation', async () => {
    const outsideQueryReady = Promise.withResolvers<void>()
    const outsideQueryDone = outsideQueryReady.promise.then(() => {
      captureQueryOutsideOperation()
      return undefined
    })
    const { queries } = await withCapturedTestQueries(async () => {
      captureQueryInsideOperation()
      outsideQueryReady.resolve()
      await outsideQueryDone
    })
    expect(queries.map(query => query.text)).toEqual(['/* insideOperation */ SELECT 1'])
  })
  it('omits a previous capture descendant from the next snapshot', async () => {
    let releasePriorQuery: () => void = () => {}
    const priorQueryReleased = new Promise<void>(resolve => {
      releasePriorQuery = resolve
    })
    let priorQueryFinished = Promise.resolve()
    await withCapturedTestQueries(async () => {
      priorQueryFinished = (async () => {
        await priorQueryReleased
        captureQueryFromPriorCapture()
      })()
    })
    const { queries } = await withCapturedTestQueries(async () => {
      captureQueryInsideOperation()
      releasePriorQuery()
      await priorQueryFinished
    })
    expect(queries.map(query => query.text)).toEqual(['/* insideOperation */ SELECT 1'])
  })
})
describe('scoped transaction diagnostics', () => {
  const result = { command: 'SELECT', rowCount: 1, oid: 0, fields: [], rows: [] }
  it('uses the same once-wrapped executor and original promise after actual fulfillment', async () => {
    const gate = Promise.withResolvers<typeof result>()
    let calls = 0
    const execute: QueryExecutor = () => {
      calls++
      return gate.promise
    }
    const commit = () => Promise.resolve()
    const query = captureTransactionQuery(Object.assign(execute, { commit }))
    const events: QueryCompletion[] = []
    const values = ['owned']
    const diagnostics = await runWithCapturedQueries(async context => {
      context.subscribe(event => {
        events.push(event)
        return undefined
      })
      const original = captureTransactionQuery(query)('SELECT $1', values)
      expect(original).toBe(gate.promise)
      expect(query.commit).toBe(commit)
      expect(calls).toBe(1)
      expect(events).toEqual([])
      values[0] = 'changed'
      gate.resolve(result)
      expect(await original).toBe(result)
      return result
    })
    expect(events).toEqual([
      {
        text: 'SELECT $1',
        values: ['owned'],
        executor: execute,
        promise: gate.promise,
        status: 'fulfilled',
      },
    ])
    expect(diagnostics.result).toBe(result)
    expect(diagnostics.completedTransactions).toEqual([
      { text: 'SELECT $1', values: ['owned'], status: 'fulfilled' },
    ])
  })
  it('preserves original rejected promise and error identity with serializable diagnostics', async () => {
    const reason = new Error('real executor rejection')
    const original = Promise.reject(reason)
    const execute: QueryExecutor = () => original
    const events: QueryCompletion[] = []
    const diagnostics = await runWithCapturedQueries(async context => {
      context.subscribe(event => {
        events.push(event)
        return undefined
      })
      const observed = captureTransactionQuery(execute)('SELECT 1')
      expect(observed).toBe(original)
      await expect(observed).rejects.toBe(reason)
    })
    expect(events).toEqual([
      expect.objectContaining({ status: 'rejected', reason, promise: original }),
    ])
    expect(JSON.parse(JSON.stringify(diagnostics.completedTransactions))).toEqual([
      {
        text: 'SELECT 1',
        values: [],
        status: 'rejected',
        error: { name: 'Error', message: reason.message },
      },
    ])
  })
  it('unsubscribes synchronously without disabling normal diagnostic snapshots', async () => {
    const events: QueryCompletion[] = []
    const execute: QueryExecutor = () => Promise.resolve(result)
    const diagnostics = await runWithCapturedQueries(async context => {
      const unsubscribe = context.subscribe(event => {
        events.push(event)
        return undefined
      })
      unsubscribe()
      unsubscribe()
      await captureTransactionQuery(execute)('SELECT 1')
    })
    expect(events).toEqual([])
    expect(diagnostics.completedTransactions).toHaveLength(1)
  })
  it('returns before unfinished queries and explicitly drains them without late notifications', async () => {
    const gate = Promise.withResolvers<typeof result>()
    const events: QueryCompletion[] = []
    const execute: QueryExecutor = () => gate.promise
    let pending: ReturnType<QueryExecutor> | undefined
    const diagnostics = await runWithCapturedQueries(async context => {
      context.subscribe(event => {
        events.push(event)
        return undefined
      })
      pending = captureTransactionQuery(execute)('SELECT 1')
      return 'handler finished'
    })
    expect(diagnostics.result).toBe('handler finished')
    gate.resolve(result)
    expect(await pending).toBe(result)
    expect(await diagnostics.completionDrain).toEqual([])
    expect(events).toEqual([])
  })
  it('retains a rejected handler error while safely closing unfinished rejected work', async () => {
    const gate = Promise.withResolvers<typeof result>()
    const reason = new Error('handler rejected')
    const events: QueryCompletion[] = []
    const execute: QueryExecutor = () => gate.promise
    await expect(
      runWithCapturedQueries(async context => {
        context.subscribe(event => {
          events.push(event)
          return undefined
        })
        void captureTransactionQuery(execute)('SELECT 1')
        throw reason
      }),
    ).rejects.toBe(reason)
    gate.reject(new Error('unfinished query rejected'))
    await expect(gate.promise).rejects.toThrow('unfinished query rejected')
    expect(events).toEqual([])
  })
  it.each(['throw', 'reject'])(
    'isolates observer %s without changing executor results',
    async kind => {
      const error = new Error('observer failed')
      const original = Promise.resolve(result)
      const execute: QueryExecutor = () => original
      const diagnostics = await runWithCapturedQueries(async context => {
        context.subscribe(() => {
          if (kind === 'throw') throw error
          return Promise.reject(error) as unknown as undefined
        })
        expect(captureTransactionQuery(execute)('SELECT 1')).toBe(original)
        expect(await original).toBe(result)
      })
      expect(await diagnostics.completionDrain).toEqual(
        expect.arrayContaining([{ name: 'Error', message: error.message }]),
      )
      expect(diagnostics.completedTransactions).toHaveLength(1)
    },
  )
  it.each(['getter', 'iterator', 'serialization'])(
    'isolates failing value %s metadata',
    async kind => {
      const error = new Error('metadata failed')
      const values =
        kind === 'serialization'
          ? [
              {
                toJSON() {
                  throw error
                },
              },
            ]
          : new Proxy([1], {
              get(target, property, receiver) {
                if (property === (kind === 'getter' ? '0' : Symbol.iterator)) throw error
                return Reflect.get(target, property, receiver)
              },
            })
      const original = Promise.resolve(result)
      const execute: QueryExecutor = () => original
      const diagnostics = await runWithCapturedQueries(async () => {
        expect(captureTransactionQuery(execute)('SELECT $1', values)).toBe(original)
        expect(await original).toBe(result)
      })
      expect(diagnostics.completedTransactions).toEqual([])
      expect(await diagnostics.completionDrain).toEqual(
        expect.arrayContaining([{ name: 'Error', message: error.message }]),
      )
    },
  )
})
