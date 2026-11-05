import { describe, expect, it } from 'vitest'

import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import {
  checkStaleSchemaAllowlistEntries,
  findStaleSchemaAllowlistEntries,
} from './schema-allowlist-freshness.mts'

const emptySchema = { tables: {} } as Pick<SchemaSnapshot, 'tables'>

describe('schema allowlist freshness', () => {
  it('checks evaluated map and spread entries against table and column existence', () => {
    const base = new Map([['posts.owner_id', 'reason']])
    const entries = [...base, ['removed.id', 'reason'], ['missing_table', 'reason']] as const
    const schema = {
      tables: { posts: { columns: { owner_id: {} } } },
    } as unknown as Pick<SchemaSnapshot, 'tables'>

    expect(findStaleSchemaAllowlistEntries(entries, schema)).toEqual([
      'removed.id',
      'missing_table',
    ])
  })

  it('checks a spread entry in an evaluated tracked allowlist', () => {
    const file =
      'backend/test-helpers/data-stores/psql/schema-static-analysis/notification-push-retention-allowlists.mts'
    const errors: string[] = []

    checkStaleSchemaAllowlistEntries([file], emptySchema, errors)

    expect(errors).toContain(
      `::error file=${file}::stale PostgreSQL schema allowlist entry: agent_moderation_retention_post_work_items.cursor_moderation_record_id`,
    )
  })

  it('checks table-only entries in a tracked allowlist', () => {
    const file =
      'backend/test-helpers/data-stores/psql/schema-static-analysis/timestamp-allowlists.mts'
    const errors: string[] = []

    checkStaleSchemaAllowlistEntries([file], emptySchema, errors)

    expect(errors).toContain(
      `::error file=${file}::stale PostgreSQL schema allowlist entry: retained_image_placement_bindings`,
    )
  })

  it('rejects a new tracked allowlist without a registered evaluated module', () => {
    const file = 'backend/test-helpers/new-schema-allowlist.mts'
    const errors: string[] = []

    checkStaleSchemaAllowlistEntries(
      ['backend/test-helpers/unrelated.mts', file],
      emptySchema,
      errors,
    )

    expect(errors).toEqual([
      `::error file=${file}::schema allowlist module is missing from freshness registry`,
    ])
  })
})
