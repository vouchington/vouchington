import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  POST_LIST_TABLES,
  type PostRelationTableName,
} from '@services/users/profile-collection-tables'
import { getVisiblePostCollectionRows } from './get-visible-collection-rows.mts'

describe('post collection relation table allowlist', () => {
  it.each(Object.values(POST_LIST_TABLES))('accepts configured table %s', async tableName => {
    await expect(getVisiblePostCollectionRows(null, tableName, randomUUID(), 1)).resolves.toEqual(
      [],
    )
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
