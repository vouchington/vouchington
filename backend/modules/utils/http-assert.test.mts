import { describe, expectTypeOf, it } from 'vitest'
import type assert from 'http-assert'

type ExpectedHttpAssert = (
  condition: unknown,
  statusCode: number,
  message?: string,
) => asserts condition

describe('http-assert ambient declaration', () => {
  it('exposes exactly the repository-owned callable type', () => {
    expectTypeOf<typeof assert>().toEqualTypeOf<ExpectedHttpAssert>()
  })
})
