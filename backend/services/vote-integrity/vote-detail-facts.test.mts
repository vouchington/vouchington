import { describe, expect, it } from 'vitest'
import { voteDetailFacts } from './vote-detail-facts.mts'

describe('vote integrity detail guards', () => {
  it('rejects malformed correlated IPs and numeric details', () => {
    expect(() => voteDetailFacts({ correlated_ips: '10.0.0.1' })).toThrow('correlated IPs')
    expect(() => voteDetailFacts({ correlated_ips: [null] })).toThrow('correlated IP')
    expect(() =>
      voteDetailFacts({ correlated_ips: [{ ip_address: 1, distinct_user_count: 2 }] }),
    ).toThrow('correlated IP')
    expect(() => voteDetailFacts({ young_account_vote_count: Number.NaN })).toThrow(
      'young_account_vote_count',
    )
  })
})
