import { it, describe } from 'vitest'
import assert from 'node:assert/strict'
import { assertValidGTIN } from './gtin.mts'

describe('assertValidGTIN', () => {
  it('does not throw for valid GTIN', () => {
    assertValidGTIN('4006381333931')
  })
  it('throws 422 for invalid format', () => {
    try {
      assertValidGTIN('abc')
      assert.fail('Should have thrown')
    } catch (e: unknown) {
      assert.ok(e && typeof e === 'object' && 'status' in e)
      assert.equal((e as { status: number }).status, 422)
    }
  })
  it('throws 422 for invalid check digit', () => {
    try {
      assertValidGTIN('4006381333932')
      assert.fail('Should have thrown')
    } catch (e: unknown) {
      assert.ok(e && typeof e === 'object' && 'status' in e)
      assert.equal((e as { status: number }).status, 422)
    }
  })
})
