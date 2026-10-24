import { describe, expect, it } from 'vitest'
import { assertNever } from './assert-never.mts'

describe('assertNever', () => {
  it('preserves a domain label and the unexpected runtime value', () => {
    expect(() => assertNever('future' as never, 'Unknown sort')).toThrowError(
      'Unknown sort: future',
    )
  })

  it('uses a default label when none is supplied', () => {
    expect(() => assertNever(null as never)).toThrowError('Unexpected value: null')
  })
})
