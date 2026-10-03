#!/usr/bin/env node

import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCHEMA_SNAPSHOT_PATH = 'backend/data-stores/psql/schema-snapshot/schema.json'

export const NO_MISTAKES_SCHEMA_CATALOG_PATH =
  'backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json'

interface CatalogColumn {
  dataType?: string
  type?: string
}

type CatalogDefinition = string | ({ definition: string } & Record<string, unknown>)

interface CatalogTable {
  checkConstraints: Record<string, CatalogDefinition>
  columns: Record<string, CatalogColumn>
  triggers: Record<string, CatalogDefinition>
}

export interface NoMistakesCatalogSnapshot {
  tables: Record<string, CatalogTable>
}

/**
 * no-mistakes 0.69 deserializes check constraints and triggers as `{ definition }`
 * objects and reads column types from `dataType`. The committed v2 snapshot stores
 * those constraints and triggers as strings and column types as `type`.
 */
export function projectNoMistakesSchemaCatalog<T extends NoMistakesCatalogSnapshot>(
  snapshot: T,
): T {
  const tables: T['tables'] = {}
  for (const [name, table] of Object.entries(snapshot.tables)) {
    tables[name] = {
      ...table,
      columns: projectColumns(table.columns),
      checkConstraints: projectDefinitions(table.checkConstraints),
      triggers: projectDefinitions(table.triggers),
    }
  }
  return { ...snapshot, tables }
}

function projectColumns(columns: Record<string, CatalogColumn>): Record<string, CatalogColumn> {
  const projected: Record<string, CatalogColumn> = {}
  for (const [name, column] of Object.entries(columns)) {
    projected[name] =
      typeof column.dataType === 'string' || typeof column.type !== 'string'
        ? column
        : { ...column, dataType: column.type }
  }
  return projected
}

function projectDefinitions(
  entries: Record<string, CatalogDefinition>,
): Record<string, CatalogDefinition> {
  const projected: Record<string, CatalogDefinition> = {}
  for (const [name, entry] of Object.entries(entries)) {
    projected[name] = typeof entry === 'string' ? { definition: entry } : entry
  }
  return projected
}

/* v8 ignore start -- direct-execution entry; CI and pnpm run no-mistakes invoke this before check. */
if (import.meta.main) {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  const snapshot = JSON.parse(
    readFileSync(join(repoRoot, SCHEMA_SNAPSHOT_PATH), 'utf8'),
  ) as NoMistakesCatalogSnapshot
  const destination = join(repoRoot, NO_MISTAKES_SCHEMA_CATALOG_PATH)
  const temporary = `${destination}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(projectNoMistakesSchemaCatalog(snapshot)))
  renameSync(temporary, destination)
}
/* v8 ignore stop */
