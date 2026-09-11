import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { loadSqlParserModule } from '../migration-runner/sql-statements.mts'
import { checkIndexRenames as checkIndexRenamesAgainstRepository } from './check-index-renames.mts'
import type { IndexRenameGit } from './index-rename-git.mts'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

const EMPTY_TABLE = {
  relationKind: 'table' as const,
  columns: {},
  primaryKey: null,
  uniqueConstraints: {},
  checkConstraints: {},
  foreignKeys: {},
  triggers: {},
  comment: null,
  physicalPartition: null,
  partition: null,
  growth: 'bounded' as const,
}

function snapshot(indexDefinitions: Record<string, string>): SchemaSnapshot {
  return {
    formatVersion: 2,
    tables: {
      widgets: {
        ...EMPTY_TABLE,
        indexes: Object.fromEntries(
          Object.entries(indexDefinitions).map(([name, definition]) => [
            name,
            {
              definition,
              accessMethod: 'btree',
              unique: false,
              primary: false,
              constraintBacked: false,
              valid: true,
              ready: true,
              keys: [],
              includedColumns: [],
              predicate: null,
            },
          ]),
        ),
      },
    },
    views: {},
    enums: {},
    extensions: {},
    functions: {},
    policies: {},
  }
}

const RENAMED_INDEX = 'idx_widgets__name'
const RENAMED_TO = 'idx_widgets__name_v2'
const BASE_SNAPSHOT = snapshot({
  [RENAMED_INDEX]: `CREATE INDEX ${RENAMED_INDEX} ON public.widgets USING btree (name)`,
})
const HEAD_SNAPSHOT = snapshot({
  [RENAMED_TO]: `CREATE INDEX ${RENAMED_TO} ON public.widgets USING btree (name)`,
})

type CheckIndexRenamesOptions = Parameters<typeof checkIndexRenamesAgainstRepository>[0]

function checkIndexRenames(options: CheckIndexRenamesOptions) {
  return checkIndexRenamesAgainstRepository({
    ...options,
    allowlist: options.allowlist ?? new Set(),
  })
}

function fakeGit(overrides: Partial<IndexRenameGit> = {}): IndexRenameGit {
  return {
    mergeBase: () => Promise.resolve('merge-base-sha'),
    assertNotShallow: () => Promise.resolve(),
    assertResolvable: () => Promise.resolve(),
    showFile: () => Promise.resolve(null),
    addedMigrationFiles: () => Promise.resolve([]),
    ...overrides,
  }
}

describe('checkIndexRenames', () => {
  beforeAll(() => loadSqlParserModule())
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
  })

  async function tempRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'check-index-renames-'))
    roots.push(root)
    return root
  }

  async function writeHeadSchemaJson(root: string, value: SchemaSnapshot): Promise<void> {
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'schema.json'), JSON.stringify(value))
  }

  it('skips with a notice when the base has no schema snapshot at the merge-base', async () => {
    const root = await tempRoot()
    const result = await checkIndexRenames({
      cwd: root,
      baseRef: 'origin/main',
      git: fakeGit({ showFile: () => Promise.resolve(null) }),
      schemaJsonRelativePath: './schema.json',
    })
    expect(result).toEqual({
      status: 'skipped',
      reason: expect.stringContaining('merge-base-sha') as unknown as string,
    })
  })

  it('reports clean and never calls addedMigrationFiles when there are no renames', async () => {
    const root = await tempRoot()
    await writeHeadSchemaJson(root, BASE_SNAPSHOT)
    const result = await checkIndexRenames({
      cwd: root,
      baseRef: 'origin/main',
      schemaJsonRelativePath: './schema.json',
      git: fakeGit({
        showFile: () => Promise.resolve(JSON.stringify(BASE_SNAPSHOT)),
        addedMigrationFiles: () => Promise.reject(new Error('must not be called')),
      }),
    })
    expect(result).toEqual({ status: 'clean' })
  })

  it('reports an unacknowledged rename with no covering drop or allowlist entry', async () => {
    const root = await tempRoot()
    await writeHeadSchemaJson(root, HEAD_SNAPSHOT)
    const result = await checkIndexRenames({
      cwd: root,
      baseRef: 'origin/main',
      schemaJsonRelativePath: './schema.json',
      git: fakeGit({
        showFile: (revision, path) =>
          Promise.resolve(
            path === './schema.json' && revision === 'merge-base-sha'
              ? JSON.stringify(BASE_SNAPSHOT)
              : null,
          ),
        addedMigrationFiles: () => Promise.resolve(['migrations/0001-added.sql']),
      }),
    })
    expect(result).toEqual({
      status: 'unacknowledged',
      unacknowledged: [
        {
          table: 'widgets',
          retiredName: RENAMED_INDEX,
          retiredDefinition: BASE_SNAPSHOT.tables.widgets.indexes[RENAMED_INDEX]!.definition,
          renamedTo: RENAMED_TO,
        },
      ],
      staleAllowlistEntries: [],
    })
  })

  it('compares a v1 merge-base snapshot with v2 working-tree indexes', async () => {
    const root = await tempRoot()
    await writeHeadSchemaJson(root, HEAD_SNAPSHOT)
    const v1Base = {
      tables: {
        widgets: {
          indexes: {
            [RENAMED_INDEX]: `CREATE INDEX ${RENAMED_INDEX} ON public.widgets USING btree (name)`,
          },
        },
      },
    }
    const result = await checkIndexRenames({
      cwd: root,
      baseRef: 'origin/main',
      schemaJsonRelativePath: './schema.json',
      git: fakeGit({
        showFile: () => Promise.resolve(JSON.stringify(v1Base)),
        addedMigrationFiles: () => Promise.resolve([]),
      }),
    })

    expect(result).toMatchObject({
      status: 'unacknowledged',
      unacknowledged: [{ retiredName: RENAMED_INDEX, renamedTo: RENAMED_TO }],
    })
  })

  it('passes when the rename is acknowledged by a drop in an added migration', async () => {
    const root = await tempRoot()
    await writeHeadSchemaJson(root, HEAD_SNAPSHOT)
    const result = await checkIndexRenames({
      cwd: root,
      baseRef: 'origin/main',
      schemaJsonRelativePath: './schema.json',
      git: fakeGit({
        showFile: (_revision, path) => {
          if (path === './schema.json') return Promise.resolve(JSON.stringify(BASE_SNAPSHOT))
          if (path === 'migrations/0001-added.sql') {
            return Promise.resolve(`DROP INDEX CONCURRENTLY IF EXISTS ${RENAMED_INDEX};`)
          }
          return Promise.resolve(null)
        },
        addedMigrationFiles: () => Promise.resolve(['migrations/0001-added.sql']),
      }),
    })
    expect(result).toEqual({ status: 'clean' })
  })

  it('accepts a rename via the allowlist and does not report it stale', async () => {
    const root = await tempRoot()
    await writeHeadSchemaJson(root, HEAD_SNAPSHOT)
    const result = await checkIndexRenames({
      cwd: root,
      baseRef: 'origin/main',
      schemaJsonRelativePath: './schema.json',
      allowlist: new Set([RENAMED_INDEX]),
      git: fakeGit({
        showFile: (_revision, path) =>
          Promise.resolve(path === './schema.json' ? JSON.stringify(BASE_SNAPSHOT) : null),
        addedMigrationFiles: () => Promise.resolve([]),
      }),
    })
    expect(result).toEqual({ status: 'clean' })
  })

  it('reports an allowlist entry matching no detected rename as stale', async () => {
    const root = await tempRoot()
    await writeHeadSchemaJson(root, BASE_SNAPSHOT)
    const result = await checkIndexRenames({
      cwd: root,
      baseRef: 'origin/main',
      schemaJsonRelativePath: './schema.json',
      allowlist: new Set(['idx_never_renamed']),
      git: fakeGit({
        showFile: () => Promise.resolve(JSON.stringify(BASE_SNAPSHOT)),
        addedMigrationFiles: () => Promise.reject(new Error('must not be called')),
      }),
    })
    expect(result).toEqual({
      status: 'unacknowledged',
      unacknowledged: [],
      staleAllowlistEntries: ['idx_never_renamed'],
    })
  })

  it('runs preflight before reading any schema snapshot', async () => {
    const root = await tempRoot()
    const calls: string[] = []
    await expect(
      checkIndexRenames({
        cwd: root,
        baseRef: 'origin/main',
        schemaJsonRelativePath: './schema.json',
        git: fakeGit({
          assertNotShallow: () => {
            calls.push('assertNotShallow')
            return Promise.reject(new Error('shallow clone'))
          },
          mergeBase: () => {
            calls.push('mergeBase')
            return Promise.resolve('merge-base-sha')
          },
        }),
      }),
    ).rejects.toThrow('shallow clone')
    expect(calls).toEqual(['assertNotShallow'])
  })
})
