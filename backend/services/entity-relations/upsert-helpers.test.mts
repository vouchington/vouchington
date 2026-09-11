import { describe, expect, it } from 'vitest'
import { getEntityId } from './upsert-helpers.mts'

describe('getEntityId', () => {
  it('returns the id for a supported entity identifier', () => {
    expect(getEntityId({ id: 'entity-1' })).toBe('entity-1')
  })

  it('throws when the entity does not expose a string id', () => {
    expect(() => getEntityId({ id: 123 } as unknown as Parameters<typeof getEntityId>[0])).toThrow(
      TypeError,
    )
  })
})
