import { describe, expect, it } from 'vitest'
import { safeUsername } from '@voucha/test-helpers/data'
import { isUsername, validateUsername } from '@modules/utils'

describe('safeUsername()', () => {
  function assertValid(name: string) {
    // Write-path: validateUsername throws on any constraint violation
    expect(() => validateUsername(name)).not.toThrow()
    // Read-path: isUsername must return true so the lookup never falls through to phone matching
    expect(isUsername(name)).toBe(true)
    expect(name.length).toBeLessThanOrEqual(50)
  }

  it('produces a valid username with the default label', () => {
    assertValid(safeUsername())
  })

  it('produces a valid username with a short letter label', () => {
    assertValid(safeUsername('cmod'))
  })

  it('truncates a long label so the result stays <= 50 chars', () => {
    const name = safeUsername('a'.repeat(80))
    expect(name.length).toBeLessThanOrEqual(50)
    assertValid(name)
  })

  it('sanitises a numeric-only label (avoids all-numeric / phone-shaped output)', () => {
    const name = safeUsername('999')
    assertValid(name)
    // Must not be all-numeric (the phone-collision guard)
    expect(/^\d+$/.test(name)).toBe(false)
  })

  it('sanitises a symbol-only label', () => {
    assertValid(safeUsername('!!'))
  })

  it('always starts with a letter regardless of label', () => {
    for (const label of ['9nine', '0', '---', '!@#', '']) {
      const name = safeUsername(label)
      expect(/^[a-z]/i.test(name)).toBe(true)
      assertValid(name)
    }
  })

  it('passes 100 consecutive calls (no rare random output edge cases)', () => {
    for (let i = 0; i < 100; i++) {
      assertValid(safeUsername('batch'))
    }
  })
})
