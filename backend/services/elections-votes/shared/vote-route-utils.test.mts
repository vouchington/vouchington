import { describe, expect, it } from 'vitest'
import {
  getElectionVoteChoiceScore,
  isElectionVoteChoice,
  toElectionVoteChoice,
} from './vote-route-utils.mts'

describe('semantic election vote policies', () => {
  it('maps every sentiment choice to its weighted score', () => {
    expect([
      getElectionVoteChoiceScore('sentiment', 'vouch'),
      getElectionVoteChoiceScore('sentiment', 'like'),
      getElectionVoteChoiceScore('sentiment', 'neutral'),
      getElectionVoteChoiceScore('sentiment', 'dislike'),
      getElectionVoteChoiceScore('sentiment', 'disavow'),
    ]).toEqual([2, 1, 0, -1, -2])
  })

  it('keeps binary policies distinct from sentiment choices', () => {
    expect(isElectionVoteChoice('recommendation', 'support')).toBe(true)
    expect(isElectionVoteChoice('recommendation', 'like')).toBe(false)
    expect(isElectionVoteChoice('relation', 'confirm')).toBe(true)
    expect(isElectionVoteChoice('moderation', 'inaccurate')).toBe(true)
  })

  it('maps clear events, historic scores, and semantic scores to choices', () => {
    expect(toElectionVoteChoice('sentiment', null)).toBeNull()
    expect(toElectionVoteChoice('sentiment', 2)).toBe('vouch')
    expect(toElectionVoteChoice('sentiment', 1, false)).toBe('vouch')
    expect(toElectionVoteChoice('sentiment', -1, false)).toBe('disavow')
    expect(toElectionVoteChoice('sentiment', 1, true)).toBe('like')
    expect(toElectionVoteChoice('sentiment', -1, true)).toBe('dislike')
    expect(toElectionVoteChoice('recommendation', -1)).toBe('oppose')
  })
})
