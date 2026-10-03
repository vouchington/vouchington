import { describe, expect, it } from 'vitest'
import { v4 as uuidv4 } from 'uuid'
import { isUUIDv7, mintUUIDv7, validateUUIDv7 } from '../index.mts'

describe('uuidv7 helpers', () => {
  it('mints UUIDv7 values', () => {
    const id = mintUUIDv7()

    expect(isUUIDv7(id)).toBe(true)
    expect(validateUUIDv7(id)).toBe(id)
  })

  it('rejects non-UUIDv7 values', () => {
    expect(isUUIDv7('not-a-uuid')).toBe(false)
    expect(isUUIDv7(uuidv4())).toBe(false)
    expect(() => validateUUIDv7('not-a-uuid')).toThrow('Invalid UUIDv7')
  })
})
