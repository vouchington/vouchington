import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { v4 as uuidv4 } from 'uuid'
import { isUUIDv7, mintUUIDv7, validateUUIDv7 } from '../index.mts'

describe('uuidv7 helpers', () => {
  it('re-exports platform mint without a local entropy fallback', () => {
    const source = readFileSync(fileURLToPath(new URL('../uuidv7.mts', import.meta.url)), 'utf8')
    expect(source).toContain("from '@vouchington/session-jwt'")
    expect(source).not.toContain("from 'uuid'")
    expect(source).not.toContain('getUuidv7RandomBytes')
  })

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
