import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSqlParserModule } from '../migration-runner/sql-statements.mts'
import { collectDeclaredDrops, unacknowledgedRenames } from './index-rename-acknowledge.mts'
import {
  detectRenamedIndexes,
  type SchemaIndexRenameSnapshot,
} from '@vouchington/postgres/pg-schema-snapshot'
import { createIndexRenameGit, type IndexRenameGit } from './index-rename-git.mts'
import {
  formatCheckIndexRenamesResult,
  type CheckIndexRenamesResult,
} from './check-index-renames-result.mts'
import { RETIRED_INDEX_ALLOWLIST } from './retired-index-allowlist.mts'

const __filename = fileURLToPath(import.meta.url)

const DEFAULT_SCHEMA_JSON_PATH = './data-stores/psql/schema-snapshot/schema.json'
const DEFAULT_MIGRATIONS_DIR = 'data-stores/psql/migrations'

export { formatCheckIndexRenamesResult }
export type { CheckIndexRenamesResult }

function historicalIndexSnapshot(json: string): SchemaIndexRenameSnapshot {
  const parsed = JSON.parse(json) as {
    tables?: Record<string, { indexes?: Record<string, string | { definition: string }> }>
  }
  if (!parsed.tables || typeof parsed.tables !== 'object') {
    throw new Error('check-index-renames: schema snapshot has no tables object.')
  }
  return {
    tables: Object.fromEntries(
      Object.entries(parsed.tables).map(([tableName, table]) => {
        if (!table || !table.indexes || typeof table.indexes !== 'object') {
          throw new Error(
            `check-index-renames: schema snapshot table "${tableName}" has no indexes object.`,
          )
        }
        return [
          tableName,
          {
            indexes: Object.fromEntries(
              Object.entries(table.indexes).map(([indexName, index]) => [
                indexName,
                typeof index === 'string' ? { definition: index } : index,
              ]),
            ),
          },
        ]
      }),
    ),
  }
}

/**
 * Second half of the preflight: once the clone is confirmed non-shallow, resolve the merge-base and
 * confirm it's actually reachable. assertResolvable depends on mergeBaseSha, so this pair stays
 * sequential — split into its own function so resolveMergeBase below never has 3 awaits in a row.
 */
async function resolveAndValidateMergeBase(git: IndexRenameGit, baseRef: string): Promise<string> {
  const mergeBaseSha = await git.mergeBase(baseRef, 'HEAD')
  await git.assertResolvable(mergeBaseSha)
  return mergeBaseSha
}

/**
 * Preflight before any comparison: a guard that silently skips on a too-shallow clone or an
 * unresolvable base is the class of bug #8517 fixed one level down, and once it starts skipping it
 * never fires again. assertNotShallow must complete — and must not have rejected — before mergeBase
 * ever runs against the clone, so this cannot be a Promise.all(); the fail-fast ordering is asserted
 * by the "runs preflight before reading any schema snapshot" test.
 */
async function resolveMergeBase(git: IndexRenameGit, baseRef: string): Promise<string> {
  await git.assertNotShallow()
  return resolveAndValidateMergeBase(git, baseRef)
}

/**
 * Detects PostgreSQL indexes renamed between `baseRef` and `HEAD` (see @vouchington/postgres/pg-schema-snapshot)
 * and reports any that this branch hasn't acknowledged with a `DROP INDEX` of the retired name in
 * an added migration, or a retired-index-allowlist.mts entry (see index-rename-acknowledge.mts).
 *
 * `cwd`/`git` are injected so this runs identically against the real repository (the CLI entry
 * below) and against a `mkdtemp` fixture repository in tests. `schemaJsonRelativePath` and
 * `migrationsDir` default to this repo's real layout but are overridable so fixture repos don't
 * need to reproduce backend/data-stores/psql/'s full directory depth.
 */
export async function checkIndexRenames({
  cwd,
  baseRef,
  git = createIndexRenameGit(cwd),
  schemaJsonRelativePath = DEFAULT_SCHEMA_JSON_PATH,
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  allowlist = RETIRED_INDEX_ALLOWLIST,
}: {
  cwd: string
  baseRef: string
  git?: IndexRenameGit
  schemaJsonRelativePath?: string
  migrationsDir?: string
  allowlist?: ReadonlySet<string>
}): Promise<CheckIndexRenamesResult> {
  const mergeBaseSha = await resolveMergeBase(git, baseRef)

  const baseSchemaJson = await git.showFile(mergeBaseSha, schemaJsonRelativePath)
  if (baseSchemaJson === null) {
    return {
      status: 'skipped',
      reason: `no schema snapshot at ${mergeBaseSha} (${schemaJsonRelativePath})`,
    }
  }
  // Read from the checked-out working tree, not `git show HEAD:path` — unlike the base schema and
  // migration contents above, which come from committed git objects. In CI this is a no-op
  // distinction: it's a clean checkout and db:snapshot:check already gates that schema.json matches
  // HEAD before this step runs. Locally, an uncommitted schema.json regeneration (schema.json
  // drifts every 1-3 days from calendar-driven partition drift) makes the comparison asymmetric:
  // renames are detected against the dirty working tree, while acknowledgement drops are still read
  // from committed HEAD.
  const headSchemaJson = await readFile(join(cwd, schemaJsonRelativePath), 'utf8')

  const base = historicalIndexSnapshot(baseSchemaJson)
  const head = historicalIndexSnapshot(headSchemaJson)
  const renames = detectRenamedIndexes({ base, head })

  let declaredDrops: ReadonlySet<string> = new Set()
  if (renames.length > 0) {
    // Loading the SQL parser module and diffing added migration paths are independent; run them
    // concurrently. collectDeclaredDrops() requires the parser module to have already resolved,
    // which Promise.all guarantees before this next await starts.
    const [, migrationPaths] = await Promise.all([
      loadSqlParserModule(),
      git.addedMigrationFiles(mergeBaseSha, 'HEAD', migrationsDir),
    ])
    declaredDrops = await collectDeclaredDrops({
      migrationPaths,
      readFile: path => git.showFile('HEAD', path),
    })
  }

  const { unacknowledged, staleAllowlistEntries } = unacknowledgedRenames(renames, {
    declaredDrops,
    allowlist,
  })
  if (unacknowledged.length === 0 && staleAllowlistEntries.length === 0) return { status: 'clean' }
  return { status: 'unacknowledged', unacknowledged, staleAllowlistEntries }
}

/* v8 ignore start -- direct-execution entry; exercised by the tests-postgres-schema CI step
   against this repository's real git history, not unit tests. check-index-renames.test.mts and
   check-index-renames.lifecycle.test.mts cover the same git plumbing and result formatting
   against mkdtemp fixture repositories instead. */
if (process.argv?.[1] && realpathSync(process.argv[1]) === __filename) {
  // Pair 2: CI passes origin/<base_ref>. Do not accept pull_request.base.sha here (#11711).
  const baseRef = process.env.PR_BASE_SHA?.trim() || 'origin/main'
  try {
    const result = await checkIndexRenames({ cwd: process.cwd(), baseRef })
    const { exitCode, lines } = formatCheckIndexRenamesResult(result)
    for (const line of lines) console.log(line)
    process.exit(exitCode)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
/* v8 ignore stop */
