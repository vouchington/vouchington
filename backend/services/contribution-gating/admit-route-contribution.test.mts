import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseIdempotencyKeyHeader } from './admit-route-contribution.mts'
import { resolveAdmissionIdentity } from './admission.mts'

describe('route contribution admission contract', () => {
  it('accepts one UUID header, rejects malformed/multiple values, and generates compatibility identities', () => {
    const key = randomUUID()
    expect(parseIdempotencyKeyHeader(key)).toBe(key)
    expect(parseIdempotencyKeyHeader(undefined)).toBeNull()
    expect(() => parseIdempotencyKeyHeader([key, randomUUID()])).toThrow('single UUID')
    expect(() => resolveAdmissionIdentity('not-a-uuid')).toThrow('must be a UUID')
    expect(resolveAdmissionIdentity(null).callerSupplied).toBe(false)
    expect(resolveAdmissionIdentity(null).callerCanReplay).toBe(false)
    expect(resolveAdmissionIdentity(key).idempotencyKey).toBe(key)
    expect(resolveAdmissionIdentity(key).callerSupplied).toBe(true)
    expect(resolveAdmissionIdentity(key).callerCanReplay).toBe(true)
  })
})
