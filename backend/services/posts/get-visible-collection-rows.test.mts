import { describe, expect, it } from 'vitest'
import { POST_LIST_TABLES } from '@services/users/profile-collection-tables'
import { assertPostRelationTableName } from './get-visible-collection-rows.mts'

describe('post collection relation table allowlist', () => {
  it.each(Object.values(POST_LIST_TABLES))('accepts configured table %s', tableName => {
    expect(assertPostRelationTableName(tableName)).toBe(tableName)
  })

  it.each(['posts', 'Relation__user__save__post', 'relation__user__save__post; DROP TABLE posts'])(
    'rejects non-configured table %s',
    tableName => {
      expect(() => assertPostRelationTableName(tableName)).toThrow(
        `Invalid postRelationTableName: ${tableName}`,
      )
    },
  )
})
