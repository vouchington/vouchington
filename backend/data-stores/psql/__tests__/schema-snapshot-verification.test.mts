import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import { buildSchemaSnapshot } from '../schema-snapshot/build-snapshot.mts'
import { readSchemaCatalog } from '../schema-snapshot/catalog-queries.mts'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import { verifyLiveSchemaMatchesSnapshot } from '../schema-snapshot/verify-live-schema.mts'

// Real-Postgres coverage for the production migrate-time drift gate
// (backend/data-stores/psql/migrate.mts's default `verifySchema`). This lives in the dedicated
// `backend-postgres-schema` Vitest project (not the shared parallel `backend-data-stores`
// project) because it reads the entire live "public" schema catalog, which is only safe to
// compare deterministically against a controlled, freshly-migrated database -- see
// docs/development/reference-tests-schema-checks.md. Every fixture below starts from a real
// snapshot captured from that live catalog and mutates a copy of it, so these tests never depend
// on the committed schema.json matching this checkout and never issue live DDL.
describe('verifyLiveSchemaMatchesSnapshot', () => {
  afterAll(onGracefulShutdown)

  async function tempRootWithSchemaJson(snapshot: SchemaSnapshot): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'verify-live-schema-'))
    await writeFile(join(root, 'schema.json'), JSON.stringify(snapshot))
    return root
  }

  it('resolves when the live catalog matches the committed snapshot exactly', async () => {
    const snapshot = buildSchemaSnapshot(await readSchemaCatalog())
    const root = await tempRootWithSchemaJson(snapshot)

    try {
      await expect(verifyLiveSchemaMatchesSnapshot({ root })).resolves.toBeUndefined()
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it('throws when the committed snapshot has a column the live catalog does not -- the missing-column half of the incident', async () => {
    const snapshot = buildSchemaSnapshot(await readSchemaCatalog())
    const [tableName, table] = Object.entries(snapshot.tables)[0] ?? []
    if (!tableName || !table) throw new Error('Expected at least one table in the live catalog.')
    const phantomColumn = `phantom_column_${randomUUID().replaceAll('-', '')}`
    const drifted: SchemaSnapshot = {
      ...snapshot,
      tables: {
        ...snapshot.tables,
        [tableName]: {
          ...table,
          columns: {
            ...table.columns,
            [phantomColumn]: {
              type: 'text',
              nullable: true,
              defaultExpression: null,
              generatedExpression: null,
              identity: null,
              generated: null,
              collation: null,
              comment: null,
              ordinalPosition: 999,
            },
          },
        },
      },
    }
    const root = await tempRootWithSchemaJson(drifted)

    try {
      await expect(verifyLiveSchemaMatchesSnapshot({ root })).rejects.toThrow(
        /does not match the committed schema snapshot/,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  // These two tests are load-bearing as a pair: the first proves version differences alone never
  // fail this check (both sides pass through the same normalizer, so any string resolves); the
  // second proves that's safe because extension *presence* -- not version -- is what still gets
  // compared.
  it('resolves when only an extension version differs from the committed snapshot -- version is platform-provisioned, not app-controlled', async () => {
    const snapshot = buildSchemaSnapshot(await readSchemaCatalog())
    const [extensionName] = Object.entries(snapshot.extensions)[0] ?? []
    if (!extensionName) {
      throw new Error('Expected at least one extension in the live catalog.')
    }
    const drifted: SchemaSnapshot = {
      ...snapshot,
      extensions: {
        ...snapshot.extensions,
        [extensionName]: { version: '9.9.9' },
      },
    }
    const root = await tempRootWithSchemaJson(drifted)

    try {
      await expect(verifyLiveSchemaMatchesSnapshot({ root })).resolves.toBeUndefined()
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it('throws when the committed snapshot has an extension the live catalog does not -- presence still participates in the comparison', async () => {
    const snapshot = buildSchemaSnapshot(await readSchemaCatalog())
    const phantomExtension = `phantom_extension_${randomUUID().replaceAll('-', '')}`
    const drifted: SchemaSnapshot = {
      ...snapshot,
      extensions: {
        ...snapshot.extensions,
        [phantomExtension]: { version: '1.0' },
      },
    }
    const root = await tempRootWithSchemaJson(drifted)

    try {
      await expect(verifyLiveSchemaMatchesSnapshot({ root })).rejects.toThrow(
        /does not match the committed schema snapshot/,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it('throws when the committed snapshot has a table the live catalog does not -- the missing-table half of the incident', async () => {
    const snapshot = buildSchemaSnapshot(await readSchemaCatalog())
    const phantomTable = `phantom_table_${randomUUID().replaceAll('-', '')}`
    const drifted: SchemaSnapshot = {
      ...snapshot,
      tables: {
        ...snapshot.tables,
        [phantomTable]: {
          relationKind: 'table',
          columns: {},
          primaryKey: null,
          uniqueConstraints: {},
          checkConstraints: {},
          foreignKeys: {},
          indexes: {},
          triggers: {},
          comment: null,
          physicalPartition: null,
          partition: null,
          growth: 'bounded',
        },
      },
    }
    const root = await tempRootWithSchemaJson(drifted)

    try {
      await expect(verifyLiveSchemaMatchesSnapshot({ root })).rejects.toThrow(
        /does not match the committed schema snapshot/,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})
