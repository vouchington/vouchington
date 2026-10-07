import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'

const repository = fileURLToPath(new URL('../..', import.meta.url))
const cli = join(repository, 'node_modules/no-mistakes/bin/no-mistakes.js')
const catalogPath = 'backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json'

type Rule = { rule?: string }
type Diagnostic = { rule: string; target: string }
type CatalogTable = Record<string, unknown>

// Use the released analyzer and the checked-in rule entries. The fixture proves
// the narrow posts exception retains every other trigger requirement.
describe('column trigger requirements no-mistakes configuration', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('accepts the posts content clock but rejects missing, malformed, and orphaned clocks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'column-trigger-requirements-'))
    dirs.push(directory)
    await writeFixture(directory, cleanTables())

    const accepted = check(directory)
    expect(accepted.status).toBe(0)
    expect(findings(accepted)).toEqual([])

    for (const [tables, target] of [
      [missingPostsTrigger(), 'table:posts'],
      [postsWithWrongFunction(), 'table:posts'],
      [postsWithWrongTiming(), 'table:posts'],
      [postsWithWrongEvent(), 'table:posts'],
      [postsWithStatementTrigger(), 'table:posts'],
      [tablesWithOrphanedTrigger(), 'table:orphaned_clock'],
    ] as const) {
      await writeCatalog(directory, tables)
      const rejected = check(directory)
      expect(rejected.status).toBe(1)
      expect(findings(rejected)).toContainEqual(
        expect.objectContaining({ rule: 'postgres-column-requires-trigger', target }),
      )
    }
  })
})

async function writeFixture(root: string, tables: Record<string, CatalogTable>): Promise<void> {
  await writeCatalog(root, tables)
  await writeFile(join(root, '.no-mistakes.yml'), stringify({ rules: await fixtureRules() }))
  expect(spawnSync('git', ['init', '-q', root]).status).toBe(0)
  expect(spawnSync('git', ['-C', root, 'add', '.']).status).toBe(0)
}

async function writeCatalog(root: string, tables: Record<string, CatalogTable>): Promise<void> {
  const catalog = JSON.parse(await readFile(join(repository, catalogPath), 'utf8')) as {
    tables: Record<string, CatalogTable>
  }
  catalog.tables = tables
  await track(root, catalogPath, JSON.stringify(catalog))
}

async function fixtureRules(): Promise<Rule[]> {
  const config = parse(await readFile(join(repository, '.no-mistakes.yml'), 'utf8')) as {
    rules: Rule[]
  }
  const rules = config.rules.filter(rule => rule.rule === 'postgres-column-requires-trigger')
  expect(rules).toHaveLength(2)
  return rules
}

function cleanTables(): Record<string, CatalogTable> {
  return {
    posts: table('posts', true, 'fn_update_updated_at()', ' OF title'),
    widgets: table('widgets', true, 'fn_update_updated_at()'),
  }
}

function missingPostsTrigger(): Record<string, CatalogTable> {
  return { posts: table('posts', true), widgets: table('widgets', true, 'fn_update_updated_at()') }
}

function postsWithWrongFunction(): Record<string, CatalogTable> {
  return {
    posts: table('posts', true, 'fn_reject_mutation()', ' OF title'),
    widgets: table('widgets', true, 'fn_update_updated_at()'),
  }
}

function postsWithWrongTiming(): Record<string, CatalogTable> {
  return {
    posts: table('posts', true, 'fn_update_updated_at()', ' OF title', 'AFTER'),
    widgets: table('widgets', true, 'fn_update_updated_at()'),
  }
}

function postsWithWrongEvent(): Record<string, CatalogTable> {
  return {
    posts: table('posts', true, 'fn_update_updated_at()', '', 'BEFORE', 'INSERT'),
    widgets: table('widgets', true, 'fn_update_updated_at()'),
  }
}

function postsWithStatementTrigger(): Record<string, CatalogTable> {
  return {
    posts: table('posts', true, 'fn_update_updated_at()', ' OF title', 'BEFORE', 'UPDATE', false),
    widgets: table('widgets', true, 'fn_update_updated_at()'),
  }
}

function tablesWithOrphanedTrigger(): Record<string, CatalogTable> {
  return {
    widgets: table('widgets', true, 'fn_update_updated_at()'),
    orphaned_clock: table('orphaned_clock', false, 'fn_update_updated_at()'),
  }
}

function table(
  name: string,
  hasUpdatedAt: boolean,
  functionCall?: string,
  columnList = '',
  timing = 'BEFORE',
  event = 'UPDATE',
  forEachRow = true,
): CatalogTable {
  return {
    checkConstraints: {},
    columns: hasUpdatedAt
      ? {
          updated_at: {
            comment: null,
            dataType: 'timestamp with time zone',
            defaultExpression: 'CURRENT_TIMESTAMP',
            generated: null,
            generatedExpression: null,
            identity: null,
            nullable: false,
            ordinalPosition: 1,
          },
        }
      : {},
    comment: null,
    foreignKeys: {},
    indexes: {},
    physicalPartition: null,
    primaryKey: null,
    relationKind: 'table',
    triggers:
      functionCall == null
        ? {}
        : {
            trigger_updated_at: {
              definition: `CREATE TRIGGER trigger_updated_at ${timing} ${event}${columnList} ON public.${name} FOR EACH ${forEachRow ? 'ROW' : 'STATEMENT'} EXECUTE FUNCTION ${functionCall}`,
            },
          },
    uniqueConstraints: {},
  }
}

async function track(root: string, path: string, content: string): Promise<void> {
  const file = join(root, path)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}

function check(directory: string) {
  return spawnSync(process.execPath, [cli, 'check', '--root', directory, '--format', 'json'], {
    encoding: 'utf8',
  })
}

function findings(result: { stdout: string }): Diagnostic[] {
  return JSON.parse(result.stdout).rules
}
