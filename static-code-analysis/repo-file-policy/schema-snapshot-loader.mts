import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import { validateSnapshot } from './schema-snapshot-validators.mts'

export const SCHEMA_SNAPSHOT_PATH = 'backend/data-stores/psql/schema-snapshot/schema.json'

type SchemaSnapshotLoadResult =
  | { snapshot: SchemaSnapshot; errors: [] }
  | { snapshot: null; errors: string[] }

/**
 * This intentionally validates the complete v2 artifact contract rather than
 * trusting a JSON cast. Static analysis must fail closed on stale or malformed facts.
 */
export function loadSchemaSnapshot(
  repoRoot: string,
  trackedFileSet: ReadonlySet<string>,
  injectedSnapshot?: unknown,
): SchemaSnapshotLoadResult {
  let value = injectedSnapshot
  if (value === undefined) {
    if (!trackedFileSet.has(SCHEMA_SNAPSHOT_PATH)) {
      return failed(`${SCHEMA_SNAPSHOT_PATH}: generated PostgreSQL schema snapshot must be tracked`)
    }
    try {
      value = JSON.parse(readFileSync(join(repoRoot, SCHEMA_SNAPSHOT_PATH), 'utf8'))
    } catch (err) {
      return failed(
        `${SCHEMA_SNAPSHOT_PATH}: could not read valid JSON (${err instanceof Error ? err.message : String(err)})`,
      )
    }
  }

  const errors = validateSnapshot(value, SCHEMA_SNAPSHOT_PATH)
  return errors.length === 0
    ? { snapshot: value as SchemaSnapshot, errors: [] }
    : { snapshot: null, errors }
}

function failed(message: string): SchemaSnapshotLoadResult {
  return { snapshot: null, errors: [diagnostic(message)] }
}

function diagnostic(message: string): string {
  return `::error file=${SCHEMA_SNAPSHOT_PATH}::${SCHEMA_SNAPSHOT_PATH}: ${message}`
}
