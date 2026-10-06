import { resolve } from 'node:path'
import { format } from 'oxfmt'
import type { PostgresCatalog } from 'no-mistakes'
import { stableStringify } from '@modules/utils/stable-stringify'
import {
  readSchemaCatalog,
  writeSchemaSnapshot as writeFromPostgres,
  type SchemaSnapshot,
} from '@vouchington/postgres/pg-schema-snapshot'
import { buildSchemaSnapshot } from './build-snapshot.mts'
import { catalogQuery } from './catalog-query.mts'
import { readNoMistakesCatalog, writeNoMistakesCatalog } from './no-mistakes-catalog.mts'
import { renderSchemaMarkdown } from './render-markdown.mts'

const __dirname = import.meta.dirname
const committedMarkdownRoot = resolve(
  __dirname,
  '../../../../docs/development/postgresql/schema-snapshot/markdown',
)

export function resolveSchemaSnapshotOutputRoots({
  root = __dirname,
  markdownRoot,
}: {
  root?: string
  markdownRoot?: string
} = {}): { root: string; markdownRoot?: string } {
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

export async function writeSchemaSnapshot({
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
  // Both writers run so one stale file never hides the other in a single --check report.
  const outcomes = await Promise.allSettled([
    writeFromPostgres({
      snapshot,
      markdown,
      check,
      root: outputs.root,
      ...(outputs.markdownRoot === undefined ? {} : { markdownRoot: outputs.markdownRoot }),
      format: formatWithOxfmt,
      stringify: stableStringify,
    }).catch(rewriteStaleError),
    catalog === undefined
      ? undefined
      : writeNoMistakesCatalog({ catalog, root: outputs.root, format: formatWithOxfmt, check }),
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

/* v8 ignore start -- live-DB generateSchemaSnapshot; writeSchemaSnapshot is unit-tested. */
export async function generateSchemaSnapshot({
  check = false,
}: { check?: boolean } = {}): Promise<void> {
  const snapshot = buildSchemaSnapshot(await readSchemaCatalog(catalogQuery))
  const { generatePostgresCatalog } = await import('no-mistakes')
  await writeSchemaSnapshot({
    snapshot,
    markdown: renderSchemaMarkdown(snapshot),
    catalog: await readNoMistakesCatalog(generatePostgresCatalog),
    check,
  })
}
/* v8 ignore stop */

/* v8 ignore start -- direct-execution entry; db:snapshot:check against a live DB. */
if (import.meta.main) {
  const check = process.argv.includes('--check')
  await generateSchemaSnapshot({ check })
  console.log(check ? 'Schema snapshot is up to date.' : 'Schema snapshot written.')
  process.exit(0)
}
/* v8 ignore stop */
