import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import { afterEach, describe, expect, it } from 'vitest'

import {
  checkExtraGeneratedColumnsFreshness,
  findGeneratedCreatedAtTables,
} from './extra-generated-columns-freshness.mts'
import { addMigrationCreateTableNames } from './migration-sql-guard.mts'

const MIGRATIONS_SQL_INCLUDE = 'backend/data-stores/psql/migrations/**/*.sql'
const trackedPlaceholder = 'backend/data-stores/psql/migrations/.no-mistakes-schema-placeholder.sql'
const roots: string[] = []

function schemaFixture(): Pick<SchemaSnapshot, 'tables'> {
  return {
    tables: {
      legacy_generated: { columns: { created_at: { generatedExpression: "'now'" } } },
      migrated_generated: { columns: { created_at: { generatedExpression: "'now'" } } },
      ordinary: { columns: { created_at: {} } },
    },
  } as unknown as Pick<SchemaSnapshot, 'tables'>
}

function configFixture(
  options: {
    generatedTables?: string[]
    predicateTables?: string[]
    predicateRuleCount?: number
    sqlInclude?: unknown
    predicateRequiresPrimaryKey?: unknown
    predicateSourceColumn?: unknown
  } = {},
) {
  const generatedTables = options.generatedTables ?? ['legacy_generated']
  const predicateTables = options.predicateTables ?? ['legacy_generated']
  return {
    rules: [
      {
        rule: 'postgres-no-generated-column-writes',
        options: {
          sqlInclude: options.sqlInclude ?? [MIGRATIONS_SQL_INCLUDE],
          extraGeneratedColumns: generatedTables.map(table => ({
            table,
            column: 'created_at',
          })),
        },
      },
      ...Array.from({ length: options.predicateRuleCount ?? 2 }, () => ({
        rule: 'postgres-generated-column-predicates',
        options: {
          requireArgumentIsPrimaryKey: options.predicateRequiresPrimaryKey ?? false,
          extraGeneratedColumns: predicateTables.map(table => ({
            table,
            column: 'created_at',
            sourceColumn: options.predicateSourceColumn ?? 'id',
          })),
        },
      })),
    ],
  }
}

async function createConfigRoot(config: ReturnType<typeof configFixture>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'generated-column-policy-'))
  roots.push(root)
  await writeFile(join(root, '.no-mistakes.yml'), JSON.stringify(config))
  return root
}

describe('extraGeneratedColumns freshness policy', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
  })

  it('extracts created tables from migration SQL using the existing narrow name pattern', () => {
    const names = new Set<string>()
    addMigrationCreateTableNames(
      `CREATE TABLE IF NOT EXISTS migrated_generated (id uuid);\nCREATE TABLE "QuotedName" (id uuid);`,
      names,
    )
    expect(names).toEqual(new Set(['migrated_generated', 'quotedname']))
  })

  it('accepts matching tracked migration and generated-column config fixtures', async () => {
    const root = await createConfigRoot(configFixture())
    const schema = schemaFixture()
    expect([...findGeneratedCreatedAtTables(schema)]).toEqual([
      'legacy_generated',
      'migrated_generated',
    ])
    expect(
      checkExtraGeneratedColumnsFreshness(
        root,
        ['.no-mistakes.yml', 'backend/data-stores/psql/migrations/001-example.sql'],
        schema,
        new Set(['migrated_generated']),
      ),
    ).toEqual([])
  })

  it('reads the allowlist only when the config is in the tracked inventory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'generated-column-partial-root-'))
    try {
      expect(checkExtraGeneratedColumnsFreshness(root, [], schemaFixture(), new Set())).toEqual([])
      expect(() =>
        checkExtraGeneratedColumnsFreshness(root, ['.no-mistakes.yml'], schemaFixture(), new Set()),
      ).toThrow(/\.no-mistakes\.yml/)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it('reports missing and stale generated-column entries across both policy rules', async () => {
    const root = await createConfigRoot(
      configFixture({ generatedTables: ['stale_table'], predicateTables: [] }),
    )
    const errors = checkExtraGeneratedColumnsFreshness(
      root,
      ['.no-mistakes.yml'],
      schemaFixture(),
      new Set(['migrated_generated']),
    )
    expect(errors).toEqual([
      expect.stringContaining('missing generated created_at table entry: legacy_generated'),
      expect.stringContaining('stale generated created_at table entry: stale_table'),
      expect.stringContaining('missing generated created_at table entry: legacy_generated'),
      expect.stringContaining('missing generated created_at table entry: legacy_generated'),
    ])
  })

  it('rejects a changed SQL include, tracked placeholder, and incomplete predicate inventory', async () => {
    const root = await createConfigRoot(
      configFixture({
        predicateRuleCount: 1,
        sqlInclude: ['backend/data-stores/psql/migrations/*.sql'],
        predicateRequiresPrimaryKey: true,
        predicateSourceColumn: 'wrong',
      }),
    )
    const errors = checkExtraGeneratedColumnsFreshness(
      root,
      ['.no-mistakes.yml', trackedPlaceholder],
      schemaFixture(),
      new Set(['migrated_generated']),
    )
    expect(errors).toEqual([
      expect.stringContaining('sqlInclude must target'),
      expect.stringContaining('schema placeholder must not be tracked'),
      expect.stringContaining('expected two postgres-generated-column-predicates rules'),
      expect.stringContaining('sourceColumn must be id'),
      expect.stringContaining('predicate rule must not require a primary-key argument'),
    ])
  })
})
