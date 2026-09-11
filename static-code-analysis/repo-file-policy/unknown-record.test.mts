import { describe, expect, it } from 'vitest'

import { isRecord } from './unknown-record.mts'

describe('isRecord', () => {
  it('accepts arrays as non-null objects for SQL parser traversal', () => {
    expect(isRecord([])).toBe(true)
    expect(isRecord({})).toBe(true)
  })

  it.each([null, undefined, true, 0, 0n, '', Symbol('value')])('rejects non-objects: %s', value => {
    expect(isRecord(value)).toBe(false)
  })
})
