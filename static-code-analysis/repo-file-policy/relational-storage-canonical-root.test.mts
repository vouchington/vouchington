import { describe, expect, it } from 'vitest'
import type { SchemaSnapshot, SchemaTableSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import { checkRelationalStorage } from './relational-storage-guard.mts'
import { emptySchemaSnapshot, plainSnapshotTable } from './schema-snapshot-test-fixtures.mts'

const expression = 'CASE WHEN (canonical_url_id IS NULL) THEN id ELSE NULL::uuid END'

function canonicalRootSchema(): SchemaSnapshot {
  const table = { ...plainSnapshotTable(), columns: {} as SchemaTableSnapshot['columns'] }
  table.columns = {
    id: {
      type: 'uuid',
      nullable: false,
      defaultExpression: 'uuidv7()',
      generatedExpression: null,
      identity: null,
      generated: null,
      collation: null,
      comment: null,
      ordinalPosition: 1,
    },
    canonical_url_id: {
      type: 'uuid',
      nullable: true,
      defaultExpression: null,
      generatedExpression: null,
      identity: null,
      generated: null,
      collation: null,
      comment: null,
      ordinalPosition: 2,
    },
    canonical_root_id: {
      type: 'uuid',
      nullable: true,
      defaultExpression: null,
      generatedExpression: expression,
      identity: null,
      generated: 'stored',
      collation: null,
      comment: null,
      ordinalPosition: 3,
    },
  }
  table.primaryKey = { columns: ['id'], definition: 'PRIMARY KEY (id)' }
  table.foreignKeys.canonical_root_fk = {
    columns: ['canonical_url_id'],
    definition: 'FOREIGN KEY (canonical_url_id) REFERENCES urls(canonical_root_id)',
    referencedTable: 'urls',
    referencedColumns: ['canonical_root_id'],
    onUpdate: 'no action',
    onDelete: 'set null',
    validated: true,
  }
  return emptySchemaSnapshot({ urls: table }) as SchemaSnapshot
}

function diagnostics(schema: SchemaSnapshot): string[] {
  return checkRelationalStorage(schema, { enforceCatalogFreshness: false })
}

describe('canonical root generated identity classification', () => {
  it('accepts the exact generated root key backed by the canonical self-reference FK', () => {
    expect(diagnostics(canonicalRootSchema())).toEqual([])
  })

  it.each([
    ['writable column', null],
    ['altered expression', 'CASE WHEN canonical_url_id IS NOT NULL THEN id ELSE NULL::uuid END'],
  ])('rejects a %s', (_label, generatedExpression) => {
    const schema = canonicalRootSchema()
    schema.tables.urls!.columns.canonical_root_id!.generatedExpression = generatedExpression
    schema.tables.urls!.columns.canonical_root_id!.generated = generatedExpression ? 'stored' : null
    expect(diagnostics(schema).join('\n')).toContain('urls.canonical_root_id')
  })

  it.each([
    ['wrong source column', ['id'], 'urls', ['canonical_root_id']],
    ['wrong target table', ['canonical_url_id'], 'communities', ['canonical_root_id']],
    ['wrong target column', ['canonical_url_id'], 'urls', ['id']],
  ])('rejects a foreign key with %s', (_label, columns, referencedTable, referencedColumns) => {
    const schema = canonicalRootSchema()
    schema.tables.urls!.foreignKeys.canonical_root_fk = {
      ...schema.tables.urls!.foreignKeys.canonical_root_fk!,
      columns,
      referencedTable,
      referencedColumns,
    }
    expect(diagnostics(schema).join('\n')).toContain('urls.canonical_root_id')
  })

  it('rejects an unvalidated FK or a table without the exact id primary key', () => {
    const unvalidated = canonicalRootSchema()
    unvalidated.tables.urls!.foreignKeys.canonical_root_fk!.validated = false
    expect(diagnostics(unvalidated).join('\n')).toContain('urls.canonical_root_id')

    const missingPrimaryKey = canonicalRootSchema()
    missingPrimaryKey.tables.urls!.primaryKey = null
    expect(diagnostics(missingPrimaryKey).join('\n')).toContain('urls.canonical_root_id')

    const compositePrimaryKey = canonicalRootSchema()
    compositePrimaryKey.tables.urls!.primaryKey!.columns = ['id', 'canonical_url_id']
    expect(diagnostics(compositePrimaryKey).join('\n')).toContain('urls.canonical_root_id')
  })

  it('does not allow the same expression on another key or table', () => {
    const schema = canonicalRootSchema()
    const column = schema.tables.urls!.columns.canonical_root_id!
    delete schema.tables.urls!.columns.canonical_root_id
    schema.tables.urls!.columns.other_root_id = column
    schema.tables.other_urls = structuredClone(schema.tables.urls!)
    delete schema.tables.other_urls.columns.other_root_id
    schema.tables.other_urls.columns.canonical_root_id = column
    expect(diagnostics(schema).join('\n')).toContain('other_urls.canonical_root_id')
  })
})
