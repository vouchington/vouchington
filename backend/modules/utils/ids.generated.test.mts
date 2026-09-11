import { describe, expect, it } from 'vitest'
import { validateUUID } from './ids.mts'

describe('UUID utilities', () => {
  it('preserves the HTTP validation boundary for every valid UUID version', () => {
    const uuidV4 = '123e4567-e89b-42d3-a456-426614174000'

    expect(validateUUID(uuidV4)).toBe(uuidV4)
    expect(() => validateUUID('invalid')).toThrow(
      expect.objectContaining({ message: 'Invalid UUID', status: 422 }),
    )
  })
})
