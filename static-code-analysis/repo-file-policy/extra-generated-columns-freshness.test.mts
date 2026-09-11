import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

const REPO_ROOT = join(import.meta.dirname, '../..')
const SCHEMA_PATH = join(REPO_ROOT, 'backend/data-stores/psql/schema-snapshot/schema.json')
const NO_MISTAKES_PATH = join(REPO_ROOT, '.no-mistakes.yml')
const MIGRATIONS_DIR = join(REPO_ROOT, 'backend/data-stores/psql/migrations')
const PLACEHOLDER_PATH = join(MIGRATIONS_DIR, '.no-mistakes-schema-placeholder.sql')
const MIGRATIONS_SQL_INCLUDE = 'backend/data-stores/psql/migrations/**/*.sql'
const CREATE_TABLE_NAME =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/gi

type ExtraGeneratedColumn = {
  table?: unknown
  column?: unknown
}

type NoMistakesRule = {
  rule?: unknown
  options?: {
    extraGeneratedColumns?: ExtraGeneratedColumn[]
    sqlInclude?: unknown
  }
}

describe('extraGeneratedColumns freshness', () => {
  it('points sqlInclude at real migrations and has no placeholder', async () => {
    const rule = await loadGeneratedColumnRule()
    expect(rule.options?.sqlInclude).toEqual([MIGRATIONS_SQL_INCLUDE])
    expect(existsSync(PLACEHOLDER_PATH)).toBe(false)
  })

  it('lists only snapshot generated created_at tables without a migration CREATE TABLE', async () => {
    const extras = [...(await loadExtraGeneratedCreatedAtTables())].toSorted()
    expect(extras).toEqual((await leftoverGeneratedCreatedAtTables()).toSorted())
  })
})

async function leftoverGeneratedCreatedAtTables(): Promise<string[]> {
  const declared = await migrationCreateTableNames()
  return (await snapshotGeneratedCreatedAtTables()).filter(table => !declared.has(table))
}

async function snapshotGeneratedCreatedAtTables(): Promise<string[]> {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8')) as SchemaSnapshot
  return Object.entries(schema.tables)
    .filter(([, table]) => typeof table.columns.created_at?.generatedExpression === 'string')
    .map(([name]) => name)
}

async function migrationCreateTableNames(): Promise<Set<string>> {
  const names = new Set<string>()
  for (const file of await listMigrationSqlFiles(MIGRATIONS_DIR)) {
    const content = await readFile(file, 'utf8')
    for (const match of content.matchAll(CREATE_TABLE_NAME)) {
      names.add((match[1] ?? match[2] ?? '').toLowerCase())
    }
  }
  return names
}

async function listMigrationSqlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await listMigrationSqlFiles(path)))
    else if (entry.isFile() && entry.name.endsWith('.sql')) files.push(path)
  }
  return files
}

async function loadGeneratedColumnRule(): Promise<NoMistakesRule> {
  const parsed = parseYaml(await readFile(NO_MISTAKES_PATH, 'utf8')) as {
    rules?: NoMistakesRule[]
  }
  const rule = parsed.rules?.find(entry => entry.rule === 'postgres-no-generated-column-writes')
  if (rule === undefined) throw new Error('postgres-no-generated-column-writes is not configured')
  return rule
}

async function loadExtraGeneratedCreatedAtTables(): Promise<Set<string>> {
  const extras = new Set<string>()
  for (const entry of (await loadGeneratedColumnRule()).options?.extraGeneratedColumns ?? []) {
    if (typeof entry.table !== 'string' || entry.column !== 'created_at') continue
    extras.add(entry.table)
  }
  return extras
}
