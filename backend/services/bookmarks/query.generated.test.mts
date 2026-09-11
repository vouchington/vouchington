import { expect, it, describe } from 'vitest'
import { queryBookmarksForRelation } from './query.mts'

describe('query.generated', () => {
  it('queryBookmarksForRelation rejects unknown relation metadata', async () => {
    await expect(
      queryBookmarksForRelation(
        '00000000-0000-7000-8000-000000000001',
        'topic',
        {
          table_name: 'relation__user__follow__topic__invalid',
          predicate: 'follow',
        },
        ['00000000-0000-7000-8000-000000000002'],
      ),
    ).rejects.toThrow('Unknown user bookmark relation')
  })
})
