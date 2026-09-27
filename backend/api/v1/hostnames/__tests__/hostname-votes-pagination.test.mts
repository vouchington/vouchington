import { describe } from 'vitest'
import { insertTestUrlHostname } from '@voucha/test-helpers'
import { registerVoteListPaginationTests } from '../../../../test-helpers/vote-list-pagination-tests.mts'

function randomHostname(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}.example.com`
}

describe('GET /api/v1/hostnames/:id/votes pagination', () => {
  registerVoteListPaginationTests({
    segment: 'hostnames',
    createId: async () => insertTestUrlHostname({ hostname: randomHostname('votes') }),
    ownChoice: 'vouch',
    otherChoice: 'disavow',
  })
})
