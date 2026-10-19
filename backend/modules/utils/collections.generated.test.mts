import { describe, expect, it } from 'vitest'
import type { ElectionVote } from '@voucha/types/entities/election'
import { electionVotesMapToRecord } from './collections.mts'

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
