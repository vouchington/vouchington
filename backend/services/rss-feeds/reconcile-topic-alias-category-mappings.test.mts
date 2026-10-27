import { describe, expect, it } from 'vitest'
import { buildTopicAliasCategoryMappingDirtyRowsQuery } from './reconcile-topic-alias-category-mappings.mts'

describe('buildTopicAliasCategoryMappingDirtyRowsQuery', () => {
  it('reads only the oldest bounded dirty rows', () => {
    const query = buildTopicAliasCategoryMappingDirtyRowsQuery(17)

    expect(query.text).toMatchInlineSnapshot(`
      "/* getTopicAliasCategoryMappingDirtyRows */
          SELECT reconciliation.topic_alias_id, reconciliation.alias, reconciliation.generation
          FROM topic_alias_category_mapping_reconciliations reconciliation
          WHERE NOT EXISTS (
            SELECT 1 FROM topic_aliases pending
            WHERE pending.id = reconciliation.topic_alias_id
              AND pending.unlink_requested_at IS NOT NULL
          )
          ORDER BY reconciliation.updated_at, reconciliation.topic_alias_id
          LIMIT $1"
    `)
    expect(query.values).toEqual([17])
  })
})
