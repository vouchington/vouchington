import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePostgresSql } from 'no-mistakes'

import { checkUuidv7CreatedAtDdl } from './uuidv7-created-at-ddl-guard.mts'

describe('uuidv7 created_at DDL identifier identity', () => {
  const testDirs: string[] = []
  const migrationPath = 'backend/data-stores/psql/migrations/0999-00-00-test.sql'

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it.each([
    [
      'quoted uppercase ID shadow',
      '"ID" uuid, id uuid PRIMARY KEY DEFAULT uuidv7(), created_at timestamptz DEFAULT now()',
      1,
    ],
    [
      'quoted uppercase ID primary key is separate',
      '"ID" uuid, id uuid DEFAULT uuidv7(), created_at timestamptz DEFAULT now(), PRIMARY KEY ("ID")',
      0,
    ],
    [
      'quoted uppercase CREATED_AT shadow',
      'id uuid PRIMARY KEY DEFAULT uuidv7(), "CREATED_AT" timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL, created_at timestamptz DEFAULT now()',
      1,
    ],
    [
      'quoted uppercase UUIDV7 function',
      'id uuid PRIMARY KEY DEFAULT "UUIDV7"(), created_at timestamptz DEFAULT now()',
      0,
    ],
    [
      'quoted uppercase timestamp function',
      'id uuid PRIMARY KEY DEFAULT uuidv7(), created_at timestamptz GENERATED ALWAYS AS ("UUID_EXTRACT_TIMESTAMP"(id)) VIRTUAL',
      1,
    ],
    [
      'quoted uppercase timestamp argument',
      '"ID" uuid, id uuid PRIMARY KEY DEFAULT uuidv7(), created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp("ID")) VIRTUAL',
      1,
    ],
    [
      'quoted lowercase equivalents',
      '"id" uuid PRIMARY KEY DEFAULT "uuidv7"(), "created_at" timestamptz GENERATED ALWAYS AS ("uuid_extract_timestamp"("id")) VIRTUAL',
      0,
    ],
    [
      'qualified UUIDv7 function',
      'id uuid PRIMARY KEY DEFAULT pg_catalog.uuidv7(), created_at timestamptz DEFAULT now()',
      1,
    ],
    [
      'non-UUIDv7 primary key',
      'id bigint PRIMARY KEY DEFAULT 1, created_at timestamptz DEFAULT now()',
      0,
    ],
  ] as const)('matches SQL identifier identity for %s', async (_label, columns, expected) => {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-uuidv7-identifiers-'))
    testDirs.push(dir)
    await mkdir(dirname(join(dir, migrationPath)), { recursive: true })
    const sql = `CREATE TABLE widgets (${columns});`
    expect((await parsePostgresSql({ sql })).diagnostics).toHaveLength(0)
    await writeFile(join(dir, migrationPath), sql)
    const errors: string[] = []
    await checkUuidv7CreatedAtDdl(dir, [migrationPath], errors)
    expect(errors).toHaveLength(expected)
  })
})
