import { expect, it, describe } from 'vitest'
import { queryBookmarksForRelation } from './query.mts'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import { bookmarkEntity, unbookmarkEntity } from './upsert.mts'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'

describe('query.generated', () => {
  it('returns only active bookmarks for the requested user and objects', async () => {
    const user = await createTestUser()
    const otherUser = await createTestUser()
    const [active, removed, other, unrequested] = await Promise.all(
      Array.from({ length: 4 }, () => createTestTopic()),
    )
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'follow',
      objectType: 'topic',
    })
    await bookmarkEntity(user, 'topic', active!, 'follow')
    await bookmarkEntity(user, 'topic', removed!, 'follow')
    await unbookmarkEntity(user, 'topic', removed!, 'follow')
    await bookmarkEntity(otherUser, 'topic', other!, 'follow')
    await bookmarkEntity(user, 'topic', unrequested!, 'follow')

    expect(
      await queryBookmarksForRelation(user.id, 'topic', relation, [
        active!.id,
        removed!.id,
        other!.id,
      ]),
    ).toEqual([{ object_id: active!.id, _bookmark_type: 'follow' }])
  })

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
