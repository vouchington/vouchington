import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  POST_LIST_TABLES,
  type PostRelationTableName,
} from '@services/users/profile-collection-tables'
import { createTestPost, createTestUser, hidePost } from '@voucha/test-helpers'
import { getVisiblePostCollectionRows } from './get-visible-collection-rows.mts'

describe('post collection relation table allowlist', () => {
  it.each(Object.values(POST_LIST_TABLES))('accepts configured table %s', async tableName => {
    await expect(getVisiblePostCollectionRows(null, tableName, randomUUID(), 1)).resolves.toEqual({
      rows: [],
      inspected: [],
      hasMore: false,
    })
  })

  it.each(['posts', 'Relation__user__save__post', 'relation__user__save__post; SELECT 1'])(
    'rejects non-configured table %s',
    async tableName => {
      await expect(
        getVisiblePostCollectionRows(null, tableName as PostRelationTableName, randomUUID(), 1),
      ).rejects.toThrow(`Invalid postRelationTableName: ${tableName}`)
    },
  )
})

describe('hidden post collection', () => {
  it('lists a hidden post but never a hidden comment, which only collapses in its thread', async () => {
    const user = await createTestUser()
    const root = await createTestPost({ user })
    const comment = await createTestPost({
      user,
      post_type: 'comment',
      parent_post_id: root.id,
      root_post_id: root.id,
    })
    await hidePost(user, root)
    await hidePost(user, comment)

    const hidden = await getVisiblePostCollectionRows(user, POST_LIST_TABLES.hidden, user.id, 10)
    expect(hidden.rows.map(row => row.entity_id)).toEqual([root.id])
  })
})
