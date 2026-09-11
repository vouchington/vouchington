import { describe, expect, it } from 'vitest'
import { buildTopicAliasCategoryMappingDirtyRowsQuery } from './reconcile-topic-alias-category-mappings.mts'

describe('buildTopicAliasCategoryMappingDirtyRowsQuery', () => {
  it('reads only the oldest bounded dirty rows', () => {
    const query = buildTopicAliasCategoryMappingDirtyRowsQuery(17)

    expect(query.text).toMatchInlineSnapshot(`
      "/* getTopicAliasCategoryMappingDirtyRows */
          SELECT topic_alias_id, alias, generation
          FROM topic_alias_category_mapping_reconciliations
          ORDER BY updated_at, topic_alias_id
          LIMIT $1"
    `)
    expect(query.values).toEqual([17])
  })
})
