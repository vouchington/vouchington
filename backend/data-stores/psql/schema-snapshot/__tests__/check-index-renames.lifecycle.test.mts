import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadSqlParserModule } from '../../migration-runner/sql-statements.mts'
import { checkIndexRenames } from '../check-index-renames.mts'
import {
  cleanupFixtureRepos,
  makeFixtureRepo,
  makeShallowClone,
} from '../check-index-renames.fixture-helpers.mts'
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
const FIXTURE_ALLOWLIST: ReadonlySet<string> = new Set()
const BASE_SNAPSHOT = snapshot({
  [RENAMED_INDEX]: `CREATE INDEX ${RENAMED_INDEX} ON public.widgets USING btree (name)`,
})
const HEAD_SNAPSHOT = snapshot({
  [RENAMED_TO]: `CREATE INDEX ${RENAMED_TO} ON public.widgets USING btree (name)`,
})

// These exercise createIndexRenameGit()'s real `git` shell-outs against a genuine mkdtemp
// repository instead of the fakeGit() double in check-index-renames.test.mts — in particular the
// `--diff-filter=A` added-vs-pre-existing migration distinction and the shallow-clone preflight,
// neither of which a fake can meaningfully stand in for.
describe('checkIndexRenames against a real git repository', () => {
  beforeAll(() => loadSqlParserModule())
  afterAll(() => cleanupFixtureRepos())

  it('detects a rename across commits via real git merge-base and show', async () => {
    const { root, commitFiles } = await makeFixtureRepo()
    const baseSha = await commitFiles({ 'schema.json': JSON.stringify(BASE_SNAPSHOT) }, 'base')
    await commitFiles({ 'schema.json': JSON.stringify(HEAD_SNAPSHOT) }, 'rename index')

    const result = await checkIndexRenames({
      cwd: root,
      baseRef: baseSha,
      schemaJsonRelativePath: 'schema.json',
      migrationsDir: 'migrations',
      allowlist: FIXTURE_ALLOWLIST,
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

  it('passes when the acknowledging drop lives in a migration added on this branch', async () => {
    const { root, commitFiles } = await makeFixtureRepo()
    const baseSha = await commitFiles({ 'schema.json': JSON.stringify(BASE_SNAPSHOT) }, 'base')
    await commitFiles(
      {
        'schema.json': JSON.stringify(HEAD_SNAPSHOT),
        'migrations/0002-drop-renamed.sql': `DROP INDEX CONCURRENTLY IF EXISTS ${RENAMED_INDEX};`,
      },
      'rename index and drop the old one',
    )

    const result = await checkIndexRenames({
      cwd: root,
      baseRef: baseSha,
      schemaJsonRelativePath: 'schema.json',
      migrationsDir: 'migrations',
      allowlist: FIXTURE_ALLOWLIST,
    })

    expect(result).toEqual({ status: 'clean' })
  })

  it('still flags a rename whose drop only exists in a migration that predates this branch', async () => {
    const { root, commitFiles } = await makeFixtureRepo()
    const baseSha = await commitFiles(
      {
        'schema.json': JSON.stringify(BASE_SNAPSHOT),
        'migrations/0001-old-drop.sql': `DROP INDEX CONCURRENTLY IF EXISTS ${RENAMED_INDEX};`,
      },
      'base already contains an unrelated pre-existing drop',
    )
    await commitFiles({ 'schema.json': JSON.stringify(HEAD_SNAPSHOT) }, 'rename index')

    const result = await checkIndexRenames({
      cwd: root,
      baseRef: baseSha,
      schemaJsonRelativePath: 'schema.json',
      migrationsDir: 'migrations',
      allowlist: FIXTURE_ALLOWLIST,
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

  it('throws rather than silently passing when the base ref does not resolve', async () => {
    const { root, commitFiles } = await makeFixtureRepo()
    await commitFiles({ 'schema.json': JSON.stringify(BASE_SNAPSHOT) }, 'base')

    await expect(
      checkIndexRenames({
        cwd: root,
        baseRef: 'totally-bogus-ref-that-does-not-exist',
        schemaJsonRelativePath: 'schema.json',
        migrationsDir: 'migrations',
        allowlist: FIXTURE_ALLOWLIST,
      }),
    ).rejects.toThrow(/could not compute a merge-base/)
  })

  it('throws on a shallow clone instead of reporting zero renames', async () => {
    const { root, commitFiles } = await makeFixtureRepo()
    await commitFiles({ 'schema.json': JSON.stringify(BASE_SNAPSHOT) }, 'base')
    await commitFiles({ 'schema.json': JSON.stringify(HEAD_SNAPSHOT) }, 'rename index')
    const shallowRoot = await makeShallowClone(root)

    await expect(
      checkIndexRenames({
        cwd: shallowRoot,
        baseRef: 'HEAD',
        schemaJsonRelativePath: 'schema.json',
        migrationsDir: 'migrations',
        allowlist: FIXTURE_ALLOWLIST,
      }),
    ).rejects.toThrow(/shallow clone/)
  })
})
