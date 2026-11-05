import { describe, expect, it } from 'vitest'

import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import {
  checkSchemaAllowlistFreshness,
  findSchemaAllowlistEntryErrors,
  type AllowlistEntries,
} from './schema-allowlist-freshness.mts'

const schema = {
  tables: { posts: { columns: { owner_id: {} } } },
} as unknown as Pick<SchemaSnapshot, 'tables'>

describe('schema allowlist freshness', () => {
  it('checks evaluated map spreads and table-only entries', () => {
    const file =
      'backend/test-helpers/data-stores/psql/schema-static-analysis/example-allowlists.mts'
    const base = new Map([['posts.owner_id', 'reason']])
    const composed = [...base, ['removed.id', 'reason']] as const
    const modules: ReadonlyMap<string, readonly AllowlistEntries[]> = new Map([
      [file, [composed, new Map([['missing_table', 'reason']])]],
    ])
    const errors: string[] = []

    checkSchemaAllowlistFreshness([file], schema, modules, errors)

    expect(errors).toEqual([
      `::error file=${file}::stale PostgreSQL schema allowlist entry: removed.id`,
      `::error file=${file}::stale PostgreSQL schema allowlist entry: missing_table`,
    ])
  })

  it('rejects malformed keys instead of accepting a valid prefix', () => {
    const entries = [
      ['posts.owner_id', 'valid column'],
      ['posts', 'valid table'],
      ['posts.owner_id.extra', 'extra segment'],
      ['posts.', 'empty column'],
      ['.owner_id', 'empty table'],
    ] as const

    expect(findSchemaAllowlistEntryErrors(entries, schema)).toEqual([
      'invalid PostgreSQL schema allowlist entry (expected table or table.column): posts.owner_id.extra',
      'invalid PostgreSQL schema allowlist entry (expected table or table.column): posts.',
      'invalid PostgreSQL schema allowlist entry (expected table or table.column): .owner_id',
    ])
  })

  it('rejects a new tracked allowlist without a registered evaluated module', () => {
    const file = 'backend/test-helpers/new-schema-allowlist.mts'
    const errors: string[] = []

    checkSchemaAllowlistFreshness(
      ['backend/test-helpers/unrelated.mts', file],
      schema,
      new Map(),
      errors,
    )

    expect(errors).toEqual([
      `::error file=${file}::schema allowlist module is missing from freshness registry`,
    ])
  })
})
