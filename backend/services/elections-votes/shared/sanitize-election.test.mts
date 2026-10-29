import { describe, it, expect } from 'vitest'
import {
  sanitizeElectionForFreeUser,
  sanitizeElectionsRecordForFreeUser,
} from './sanitize-election.mts'

describe('sanitizeElectionForFreeUser', () => {
  it('hides the down-count while preserving the score and other fields', () => {
    const election = {
      __entity_type: 'topic',
      id: '00000000-0000-0000-0000-000000000001',
      votes_count_up: 10,
      votes_count_down: 3,
      votes_score_net: 7,
    }

    expect(sanitizeElectionForFreeUser(election)).toEqual({
      __entity_type: 'topic',
      id: '00000000-0000-0000-0000-000000000001',
      votes_count_up: 10,
      votes_count_down: 0,
      votes_score_net: 7,
    })
  })

  it('handles election with all zeros', () => {
    const election = {
      __entity_type: 'topic',
      id: '00000000-0000-0000-0000-000000000004',
      votes_count_up: 0,
      votes_count_down: 0,
      votes_score_net: 0,
    }
    const result = sanitizeElectionForFreeUser(election)
    expect(result.votes_count_down).toBe(0)
    expect(result.votes_score_net).toBe(0)
    expect(result.votes_count_up).toBe(0)
  })
})

describe('sanitizeElectionsRecordForFreeUser', () => {
  it('returns empty object for empty input', () => {
    const result = sanitizeElectionsRecordForFreeUser({})
    expect(result).toEqual({})
  })

  it('sanitizes multiple elections in the record', () => {
    const elections = {
      'topic-a': {
        __entity_type: 'topic',
        id: 'topic-a',
        votes_count_up: 10,
        votes_count_down: 4,
        votes_score_net: 6,
      },
      'post-b': {
        __entity_type: 'post',
        id: 'post-b',
        votes_count_up: 0,
        votes_count_down: 3,
        votes_score_net: -3,
      },
    }
    expect(sanitizeElectionsRecordForFreeUser(elections)).toEqual({
      'topic-a': {
        __entity_type: 'topic',
        id: 'topic-a',
        votes_count_up: 10,
        votes_count_down: 0,
        votes_score_net: 6,
      },
      'post-b': {
        __entity_type: 'post',
        id: 'post-b',
        votes_count_up: 0,
        votes_count_down: 0,
        votes_score_net: -3,
      },
    })
  })
})
