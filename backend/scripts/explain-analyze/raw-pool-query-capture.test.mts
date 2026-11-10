import { runRawPoolCaptureProbe } from '@voucha/test-helpers/explain-query-capture'
import { describe, expect, it } from 'vitest'
import { captureNamedRawPoolQueries } from './raw-pool-query-capture.mts'

const install = () => captureNamedRawPoolQueries(['rawCaptureString', 'rawCaptureConfig'])

describe('raw pool query capture', () => {
  it.each([
    { label: 'successful callback', error: undefined },
    { label: 'failed callback', error: new Error('capture callback failed') },
  ])('captures parameters and restores pooled clients after a $label', async ({ error }) => {
    const result = await runRawPoolCaptureProbe(install, error)
    expect(result.error).toBe(error)
    expect(result.reacquiredSameClient).toBe(true)
    expect(result.sameWrapperAfterReacquire).toBe(true)
    expect(result.restoredOriginalQuery).toBe(true)
    expect(result.beforeRestore.map(({ text }) => text.slice(3, text.indexOf(' */')))).toEqual([
      'rawCaptureString',
      'rawCaptureConfig',
      'rawCaptureString',
    ])
    expect(result.beforeRestore.map(({ values }) => values)).toEqual([
      ['string-value'],
      [42],
      ['reacquired'],
    ])
    expect(result.afterRestore).toEqual(result.beforeRestore)
  })
})
