import { describe, it, expect } from 'vitest'
import {
  sanitizeElectionForFreeUser,
  sanitizeElectionsRecordForFreeUser,
} from './sanitize-election.mts'

describe('sanitizeElectionForFreeUser', () => {
  it('sets votes_count_down to 0', () => {
    const election = {
      __entity_type: 'topic',
      id: '00000000-0000-0000-0000-000000000001',
      votes_count_up: 10,
      votes_count_down: 3,
      votes_score_net: 7,
    }
    const result = sanitizeElectionForFreeUser(election)
    expect(result.votes_count_down).toBe(0)
  })

  it('preserves votes_score_net while hiding only the down-count', () => {
    const election = {
      __entity_type: 'topic',
      id: '00000000-0000-0000-0000-000000000002',
      votes_count_up: 10,
      votes_count_down: 3,
      votes_score_net: 7,
    }
    const result = sanitizeElectionForFreeUser(election)
    expect(result.votes_score_net).toBe(7)
  })

  it('preserves other fields', () => {
    const election = {
      __entity_type: 'post',
      id: '00000000-0000-0000-0000-000000000003',
      votes_count_up: 5,
      votes_count_down: 2,
      votes_score_net: 3,
    }
    const result = sanitizeElectionForFreeUser(election)
    expect(result.__entity_type).toBe('post')
    expect(result.id).toBe('00000000-0000-0000-0000-000000000003')
    expect(result.votes_count_up).toBe(5)
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

  it('sanitizes a single election in the record', () => {
    const elections = {
      'topic-1': {
        __entity_type: 'topic',
        id: 'topic-1',
        votes_count_up: 8,
        votes_count_down: 3,
        votes_score_net: 5,
      },
    }
    const result = sanitizeElectionsRecordForFreeUser(elections)
    expect(result['topic-1']!.votes_count_down).toBe(0)
    expect(result['topic-1']!.votes_score_net).toBe(5)
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
        votes_count_up: 20,
        votes_count_down: 7,
        votes_score_net: 13,
      },
    }
    const result = sanitizeElectionsRecordForFreeUser(elections)
    expect(Object.keys(result)).toHaveLength(2)

    expect(result['topic-a']!.votes_count_down).toBe(0)
    expect(result['topic-a']!.votes_score_net).toBe(6)

    expect(result['post-b']!.votes_count_down).toBe(0)
    expect(result['post-b']!.votes_score_net).toBe(13)
  })

  it('each election gets votes_count_down: 0 and retains votes_score_net', () => {
    const elections = {
      first: {
        __entity_type: 'topic',
        id: 'first',
        votes_count_up: 15,
        votes_count_down: 5,
        votes_score_net: 10,
      },
      second: {
        __entity_type: 'post',
        id: 'second',
        votes_count_up: 0,
        votes_count_down: 3,
        votes_score_net: -3,
      },
    }
    const result = sanitizeElectionsRecordForFreeUser(elections)

    for (const [key, election] of Object.entries(result)) {
      expect(election.votes_count_down).toBe(0)
      expect(election.votes_score_net).toBe(
        elections[key as keyof typeof elections]!.votes_score_net,
      )
    }
  })
})
