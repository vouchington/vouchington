import { resolve } from 'node:path'
import { format } from 'oxfmt'
import type { PostgresCatalog } from 'no-mistakes'
import { stableStringify } from '@modules/utils/stable-stringify'
import {
  writeSchemaSnapshot as writeFromPostgres,
  type SchemaSnapshot,
} from '@vouchington/postgres/pg-schema-snapshot'
import { writeNoMistakesCatalog } from './no-mistakes-catalog.mts'

const __dirname = import.meta.dirname
const committedMarkdownRoot = resolve(
  __dirname,
  '../../../../docs/development/postgresql/schema-snapshot/markdown',
)

function resolveSchemaSnapshotOutputRoots({
  root = __dirname,
  markdownRoot,
}: {
  root?: string
  markdownRoot?: string
}): { root: string; markdownRoot?: string } {
  const resolvedMarkdownRoot =
    markdownRoot ?? (root === __dirname ? committedMarkdownRoot : undefined)
  return {
    root,
    ...(resolvedMarkdownRoot === undefined ? {} : { markdownRoot: resolvedMarkdownRoot }),
  }
}

async function formatWithOxfmt(path: string, raw: string): Promise<string> {
  const result = await format(path, raw)
  if (result.errors.length > 0) {
    throw new Error(
      `oxfmt failed to format ${path}:\n${result.errors.map(err => err.message).join('\n')}`,
    )
  }
  return result.code
}

function rewriteStaleError(error: unknown): never {
  if (
    error instanceof Error &&
    error.message.startsWith('PostgreSQL schema snapshot is stale. Regenerate it and commit:')
  ) {
    throw new Error(
      error.message.replace(
        'PostgreSQL schema snapshot is stale. Regenerate it and commit:',
        'The PostgreSQL schema snapshot is stale. Regenerate it against a PostgreSQL 18 ' +
          "database (matching CI's digest-pinned pgvector/pgvector:pg18 image) by running " +
          '`pnpm run db:snapshot:update` and commit the result:',
      ),
      { cause: error },
    )
  }
  throw error
}

async function writeSchemaSnapshot({
  snapshot,
  markdown,
  catalog,
  check,
  root,
  markdownRoot,
}: {
  snapshot: SchemaSnapshot
  markdown: Map<string, string>
  catalog?: PostgresCatalog
  check: boolean
  root: string
  markdownRoot?: string
}): Promise<void> {
  // Both writers run so one stale file never hides the other in a single --check report.
  const outcomes = await Promise.allSettled([
    writeFromPostgres({
      snapshot,
      markdown,
      check,
      root,
      ...(markdownRoot === undefined ? {} : { markdownRoot }),
      format: formatWithOxfmt,
      stringify: stableStringify,
    }).catch(rewriteStaleError),
    catalog === undefined
      ? undefined
      : writeNoMistakesCatalog({ catalog, root, format: formatWithOxfmt, check }),
  ])
  const failures = outcomes.flatMap(outcome =>
    outcome.status === 'rejected' ? [outcome.reason as Error] : [],
  )
  const [firstFailure] = failures
  if (failures.length === 1) throw firstFailure
  if (failures.length > 1) {
    throw new AggregateError(failures, failures.map(failure => failure.message).join('\n\n'))
  }
}

/** Publish a finite schema snapshot and its app-owned catalogs and Markdown outputs. */
export async function publishSchemaSnapshot({
  snapshot,
  markdown,
  catalog,
  check = false,
  root,
  markdownRoot,
}: {
  snapshot: SchemaSnapshot
  markdown: Map<string, string>
  catalog?: PostgresCatalog
  check?: boolean
  root?: string
  markdownRoot?: string
}): Promise<void> {
  const outputs = resolveSchemaSnapshotOutputRoots({ root, markdownRoot })
  await writeSchemaSnapshot({
    snapshot,
    markdown,
    catalog,
    check,
    ...outputs,
  })
}
