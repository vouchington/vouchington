import { describe, expect, it } from 'vitest'
import { USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH } from './validation.mts'

describe('validation constants', () => {
  it('exports username length constraints', () => {
    expect(USERNAME_MIN_LENGTH).toBe(3)
    expect(USERNAME_MAX_LENGTH).toBe(50)
  })
})
