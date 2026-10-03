import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  projectNoMistakesSchemaCatalog,
  SCHEMA_SNAPSHOT_PATH,
  type NoMistakesCatalogSnapshot,
} from './no-mistakes-schema-catalog.mts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function snapshot(): NoMistakesCatalogSnapshot & { formatVersion: number } {
  return {
    formatVersion: 2,
    tables: {
      accounts: {
        columns: {
          id: { type: 'uuid' },
          renamed: { type: 'text', dataType: 'citext' },
        },
        checkConstraints: {
          accounts_active_check: 'CHECK ((is_active = true))',
          accounts_ready_check: { definition: 'CHECK ((ready))', validated: false },
        },
        triggers: {
          trigger_accounts_touch: 'CREATE TRIGGER trigger_accounts_touch BEFORE UPDATE ON accounts',
        },
      },
    },
  }
}

describe('no-mistakes schema catalog projection', () => {
  it('wraps string constraints and copies column type to dataType', () => {
    const source = snapshot()
    const projected = projectNoMistakesSchemaCatalog(source)

    expect(projected.formatVersion).toBe(2)
    expect(projected.tables.accounts.columns.id).toEqual({ type: 'uuid', dataType: 'uuid' })
    expect(projected.tables.accounts.columns.renamed).toEqual({ type: 'text', dataType: 'citext' })
    expect(projected.tables.accounts.checkConstraints.accounts_active_check).toEqual({
      definition: 'CHECK ((is_active = true))',
    })
    expect(projected.tables.accounts.checkConstraints.accounts_ready_check).toEqual({
      definition: 'CHECK ((ready))',
      validated: false,
    })
    expect(projected.tables.accounts.triggers.trigger_accounts_touch).toEqual({
      definition: 'CREATE TRIGGER trigger_accounts_touch BEFORE UPDATE ON accounts',
    })
    expect(source.tables.accounts.checkConstraints.accounts_active_check).toBe(
      'CHECK ((is_active = true))',
    )
    expect(source.tables.accounts.columns.id).toEqual({ type: 'uuid' })
  })

  it('projects the committed snapshot without leaving string constraints', () => {
    const source = JSON.parse(
      readFileSync(join(repoRoot, SCHEMA_SNAPSHOT_PATH), 'utf8'),
    ) as NoMistakesCatalogSnapshot
    const projected = projectNoMistakesSchemaCatalog(source)
    const table = projected.tables.admin_import_batches
    if (!table) throw new Error('missing admin_import_batches')

    expect(table.checkConstraints.admin_import_batches_completed_rows_check).toEqual({
      definition: 'CHECK ((completed_rows >= 0))',
    })
    expect(table.triggers.trigger_admin_import_batches_updated_at).toEqual({
      definition: expect.stringContaining('CREATE TRIGGER trigger_admin_import_batches_updated_at'),
    })
    expect(table.columns.created_by_id?.dataType).toBe('uuid')
    expect(table.columns.created_by_id?.dataType).toBe(table.columns.created_by_id?.type)
  })
})
