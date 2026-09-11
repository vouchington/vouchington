import { describe, expect, it } from 'vitest'
import type { ElectionVote } from '@voucha/types/entities/election'
import { indexById, electionVotesMapToRecord } from './collections.mts'

describe('indexById', () => {
  it('indexes values by id and skips nullish entries', () => {
    expect(indexById([{ id: 'a', value: 1 }, null, undefined, { id: 'b', value: 2 }])).toEqual({
      a: { id: 'a', value: 1 },
      b: { id: 'b', value: 2 },
    })
  })

  it('keeps prototype-shaped ids as own enumerable data properties', () => {
    const value = { id: '__proto__', name: 'safe' }
    const indexed = indexById([value])

    expect(Object.getPrototypeOf(indexed)).toBe(Object.prototype)
    expect(Object.getOwnPropertyDescriptor(indexed, '__proto__')).toMatchObject({
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  })
})

describe('electionVotesMapToRecord', () => {
  it('converts a Map to a Record', () => {
    const vote: ElectionVote = {
      __entity_type: 'election_vote',
      user_id: 'u1',
      entity_id: 'e1',
      choice: 'like',
      created_at: new Date('2025-01-01'),
    }
    const map = new Map([['e1', vote]])
    const result = electionVotesMapToRecord(map)
    expect(result).toEqual({ e1: vote })
  })

  it('returns empty object for empty map', () => {
    expect(electionVotesMapToRecord(new Map())).toEqual({})
  })
})
