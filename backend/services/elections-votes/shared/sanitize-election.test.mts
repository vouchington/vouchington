import { describe, it, expect } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { maybeSanitizeElection, maybeSanitizeElections } from './sanitize-election.mts'

const freeUser = { roles: [], membership_plan: null } as unknown as PrivateUser
const paidUser = { roles: [], membership_plan: 'plus' } as unknown as PrivateUser
const adminUser = { roles: ['administrator'], membership_plan: null } as unknown as PrivateUser

const election = {
  __entity_type: 'topic',
  id: '00000000-0000-0000-0000-000000000001',
  votes_count_up: 10,
  votes_count_down: 3,
  votes_score_net: 7,
}

describe('maybeSanitizeElection', () => {
  it('hides the down-count from signed-out and free users while preserving the rest', () => {
    const expected = { ...election, votes_count_down: 0 }

    expect(maybeSanitizeElection(null, election)).toEqual(expected)
    expect(maybeSanitizeElection(freeUser, election)).toEqual(expected)
  })

  it('keeps the down-count for paid members and administrators', () => {
    expect(maybeSanitizeElection(paidUser, election)).toBe(election)
    expect(maybeSanitizeElection(adminUser, election)).toBe(election)
  })

  it('returns null when there is no election', () => {
    expect(maybeSanitizeElection(freeUser, null)).toBeNull()
  })
})

describe('maybeSanitizeElections', () => {
  const elections = {
    'topic-a': { ...election, id: 'topic-a', votes_count_down: 4, votes_score_net: 6 },
    'post-b': {
      __entity_type: 'post',
      id: 'post-b',
      votes_count_up: 0,
      votes_count_down: 3,
      votes_score_net: -3,
    },
  }

  it('returns an empty record for empty input', () => {
    expect(maybeSanitizeElections(freeUser, {})).toEqual({})
  })

  it('hides the down-count on every election for free users', () => {
    expect(maybeSanitizeElections(freeUser, elections)).toEqual({
      'topic-a': { ...elections['topic-a'], votes_count_down: 0 },
      'post-b': { ...elections['post-b'], votes_count_down: 0 },
    })
  })

  it('keeps the record untouched for paid members', () => {
    expect(maybeSanitizeElections(paidUser, elections)).toBe(elections)
  })
})
