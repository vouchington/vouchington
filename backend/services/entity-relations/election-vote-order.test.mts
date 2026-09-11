import { describe, expect, it } from 'vitest'
import { orderBidirectionalElectionVoteWrites } from './election-vote-order.mts'

describe('orderBidirectionalElectionVoteWrites', () => {
  it('uses the same relation lock order for inverse callers', () => {
    const forward = {
      relationTable: 'relation__post__related__post',
      relationIds: ['00000000-0000-7000-8000-000000000002'],
      value: 'forward',
    }
    const reverse = {
      relationTable: 'relation__post__related__post',
      relationIds: ['00000000-0000-7000-8000-000000000001'],
      value: 'reverse',
    }

    expect(
      orderBidirectionalElectionVoteWrites([forward, reverse]).map(write => write.value),
    ).toEqual(['reverse', 'forward'])
    expect(
      orderBidirectionalElectionVoteWrites([reverse, forward]).map(write => write.value),
    ).toEqual(['reverse', 'forward'])
  })
})
