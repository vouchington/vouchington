import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import {
  checkStaleSchemaAllowlistEntries,
  findStaleSchemaAllowlistEntries,
} from './schema-allowlist-freshness.mts'

describe('schema allowlist freshness', () => {
  it('reports allowlist entries whose table or column disappeared', () => {
    const allowlist = `new Map([['posts.owner_id', 'reason'], ['removed.id', 'reason']])`
    const schema = {
      tables: { posts: { columns: { id: {}, owner_id: {} } } },
    } as unknown as Pick<SchemaSnapshot, 'tables'>
    expect(findStaleSchemaAllowlistEntries(allowlist, schema)).toEqual(['removed.id'])
  })

  it('flags a stale entry in a tracked schema allowlist file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-schema-allowlist-'))
    try {
      const file =
        'backend/test-helpers/data-stores/psql/schema-static-analysis/uuid-allowlists.mts'
      await mkdir(dirname(join(dir, file)), { recursive: true })
      await writeFile(
        join(dir, file),
        `export const UUID_ALLOWLIST = [['removed_table.id', 'reason']]\n`,
      )
      const errors: string[] = []
      checkStaleSchemaAllowlistEntries(dir, [file], { tables: {} }, errors)
      expect(errors).toEqual([
        expect.stringContaining('stale PostgreSQL schema allowlist entry: removed_table.id'),
      ])
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})
