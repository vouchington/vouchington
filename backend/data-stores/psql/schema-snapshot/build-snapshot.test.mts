import { describe, expect, it } from 'vitest'

import { buildSchemaSnapshot } from './build-snapshot.mts'
import type { SchemaCatalog } from '@vouchington/postgres/pg-schema-snapshot'

describe('buildSchemaSnapshot', () => {
  it('applies the Filaments schema-growth policy to the platform snapshot builder', () => {
    const catalog: SchemaCatalog = {
      tables: [
        {
          table_name: 'posts',
          relkind: 'p',
          partition_strategy: 'r',
          partition_key: 'id',
          comment: null,
        },
        {
          table_name: 'ai_usage_openai_response_keys',
          relkind: 'r',
          partition_strategy: '',
          partition_key: null,
          comment: null,
        },
      ],
      columns: [],
      constraints: [],
      indexes: [],
      triggers: [],
      enums: [],
      views: [],
      extensions: [],
      functions: [],
      policies: [],
    }

    const snapshot = buildSchemaSnapshot(catalog)

    expect(snapshot.tables.posts).toMatchObject({
      growth: 'unbounded',
      partition: {
        strategy: 'RANGE',
        key: 'id',
        children: 'default',
        retentionOwner: null,
        accessClass: 'target-scoped',
      },
    })
    expect(snapshot.tables.ai_usage_openai_response_keys).toMatchObject({
      growth: 'unbounded',
      partition: null,
    })
  })
})
