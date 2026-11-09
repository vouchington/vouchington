import { buildSchemaSnapshot } from './build-snapshot.mts'
import { readSchemaCatalog } from './catalog-queries.mts'
import { readNoMistakesCatalog } from './no-mistakes-catalog.mts'
import { renderSchemaMarkdown } from './render-markdown.mts'
import { publishSchemaSnapshot } from './publish.mts'

/* v8 ignore start -- live-DB generateSchemaSnapshot has no unit test. */
export async function generateSchemaSnapshot({
  check = false,
}: { check?: boolean } = {}): Promise<void> {
  const snapshot = buildSchemaSnapshot(await readSchemaCatalog())
  const { generatePostgresCatalog } = await import('no-mistakes')
  await publishSchemaSnapshot({
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
