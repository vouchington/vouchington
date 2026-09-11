import sql from 'sql-template-strings'
import { afterEach, describe, expect, it } from 'vitest'
import { stopTestQueryCapture } from '../../test-helpers/query-capture.mts'

import {
  clearCapturedQueries,
  disableQueryCapture,
  enableQueryCapture,
  getCapturedQueries,
  maybeCaptureQuery,
} from './query-capture.mts'
import type { QueryInput } from './types.mts'

describe('query capture', () => {
  afterEach(() => {
    disableQueryCapture()
    clearCapturedQueries()
  })

  it('ignores queries until capture is enabled', () => {
    maybeCaptureQuery('/* skipped */ SELECT 1')
    expect(getCapturedQueries()).toEqual([])
  })

  it('records strings, SQL statements, and ignores unknown input', () => {
    enableQueryCapture()
    maybeCaptureQuery('/* fromString */ SELECT $1', [1])
    maybeCaptureQuery(sql`/* fromSql */ SELECT ${2}`)
    maybeCaptureQuery({} as QueryInput)
    expect(getCapturedQueries()).toEqual([
      expect.objectContaining({ text: '/* fromString */ SELECT $1', values: [1] }),
      expect.objectContaining({ text: expect.stringContaining('/* fromSql */ SELECT') }),
    ])
    disableQueryCapture()
    maybeCaptureQuery('/* afterDisable */ SELECT 1')
    expect(getCapturedQueries()).toHaveLength(2)
    clearCapturedQueries()
    expect(getCapturedQueries()).toEqual([])
  })

  it('stops test capture with a returned snapshot and no residual state', () => {
    enableQueryCapture()
    maybeCaptureQuery('/* capturedBeforeStop */ SELECT $1', [1])
    const capturedBeforeStop = getCapturedQueries()

    const stoppedQueries = stopTestQueryCapture()
    expect(stoppedQueries).toEqual([
      expect.objectContaining({ text: '/* capturedBeforeStop */ SELECT $1', values: [1] }),
    ])
    expect(stoppedQueries[0]).not.toBe(capturedBeforeStop[0])
    expect(stoppedQueries[0]?.values).not.toBe(capturedBeforeStop[0]?.values)
    expect(getCapturedQueries()).toEqual([])

    maybeCaptureQuery('/* capturedAfterStop */ SELECT 2')
    expect(getCapturedQueries()).toEqual([])
  })

  it('disables and clears capture when snapshot cloning fails', () => {
    const values = new Proxy([1], {
      get(target, property, receiver) {
        if (property === Symbol.iterator) throw new Error('values clone failed')
        return Reflect.get(target, property, receiver)
      },
    })
    enableQueryCapture()
    maybeCaptureQuery('/* cloneFailure */ SELECT $1', values)

    expect(() => stopTestQueryCapture()).toThrow('values clone failed')
    expect(getCapturedQueries()).toEqual([])

    maybeCaptureQuery('/* afterCloneFailure */ SELECT 2')
    expect(getCapturedQueries()).toEqual([])
  })
})
