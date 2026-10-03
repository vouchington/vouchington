import { afterEach, describe, expect, it } from 'vitest'
import { stopTestQueryCapture, withCapturedTestQueries } from '../../test-helpers/query-capture.mts'

import {
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
    const outsideQueryDone = new Promise<void>(resolve => {
      setImmediate(() => {
        captureQueryOutsideOperation()
        resolve()
      })
    })

    const { queries } = await withCapturedTestQueries(async () => {
      captureQueryInsideOperation()
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
