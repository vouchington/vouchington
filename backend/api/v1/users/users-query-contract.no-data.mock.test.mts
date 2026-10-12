/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- This checked-in contract test has no external dependency to mock; the .no-data.mock suffix is load-bearing because it routes the test to the DB/Valkey-free project. */
import { describe, expect, it } from 'vitest'
import { RuntimeRequestValidatorRegistry } from '@services/runtime-request-validation'

const operation = 'GET:/api/v1/users'

describe('GET /api/v1/users query contract', () => {
  const validate = (query: Record<string, unknown>) =>
    RuntimeRequestValidatorRegistry.shared.validate(operation, 'query', query)

  it('rejects a lookup with neither username nor q', () => {
    expect(validate({})).toMatchObject({
      message: expect.stringContaining('Invalid request query'),
    })
    expect(validate({ after: 'cursor', limit: 10 })).toMatchObject({
      message: expect.stringContaining('Invalid request query'),
    })
  })

  it('accepts username lookup, search, and both together', () => {
    expect(validate({ username: 'ada' })).toBeNull()
    expect(validate({ q: 'ada' })).toBeNull()
    expect(validate({ username: 'ada', q: 'ada', limit: 10, after: 'cursor' })).toBeNull()
  })
})
