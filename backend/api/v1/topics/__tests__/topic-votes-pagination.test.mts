import { describe } from 'vitest'
import { createTestTopic } from '@voucha/test-helpers'
import { registerVoteListPaginationTests } from '../../../../test-helpers/vote-list-pagination-tests.mts'

describe('GET /api/v1/topics/:id/votes pagination', () => {
  registerVoteListPaginationTests({
    segment: 'topics',
    createId: async () => (await createTestTopic()).id,
    ownChoice: 'like',
    otherChoice: 'dislike',
  })
})
