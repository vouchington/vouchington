import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { close as closePsql } from '@data-stores/psql'
import { onGracefulShutdown } from '@data-stores/valkey-core'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import { format } from 'oxfmt'
import {
  buildClientManifest,
  renderCatalogTable,
  spliceCatalogTable,
} from './agent-tool-catalog.mts'
import { buildMcpCatalog } from './build-mcp-catalog.mts'

const repoPath = (path: string): string =>
  fileURLToPath(new URL(`../../../../${path}`, import.meta.url))
const toJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

async function generate(): Promise<void> {
  const args = process.argv.slice(process.argv[2] === '--' ? 3 : 2)
  if (args.some(arg => arg !== '--check') || args.length > 1)
    throw new Error('Usage: pnpm run mcp:catalog [--check]')
  const check = args.includes('--check')
  const markdownPath = repoPath('docs/overview/architecture/agent-tools/catalog.md')
  const artifacts = [
    { path: repoPath('api-fixtures/v1/mcp.json'), raw: toJson(buildMcpCatalog(ALL_TOOLS)) },
    {
      path: markdownPath,
      raw: spliceCatalogTable(await readFile(markdownPath, 'utf8'), renderCatalogTable(ALL_TOOLS)),
    },
    { path: repoPath('backend/tools/manifest.json'), raw: toJson(buildClientManifest(ALL_TOOLS)) },
  ]
  // Format every artifact before writing any, so formatter errors do not partially publish.
  const formatted = await Promise.all(
    artifacts.map(async ({ path, raw }) => {
      const result = await format(path, raw)
      if (result.errors.length > 0)
        throw new Error(`Cannot format ${path}: ${JSON.stringify(result.errors)}`)
      return { path, code: result.code }
    }),
  )
  if (check) {
    const stale = await Promise.all(
      formatted.map(async ({ path, code }) =>
        (await readFile(path, 'utf8')) === code ? null : path,
      ),
    )
    const paths = stale.filter(path => path !== null)
    if (paths.length > 0) throw new Error(`Stale MCP catalog artifacts: ${paths.join(', ')}`)
  } else {
    await Promise.all(formatted.map(({ path, code }) => writeFile(path, code)))
  }
}

// Tool modules initialize shared runtime resources on import; close them for this one-shot CLI.
const failures: unknown[] = []
try {
  await generate()
} catch (err) {
  failures.push(err)
} finally {
  const results = await Promise.allSettled([onGracefulShutdown(), closePsql()])
  failures.push(...results.flatMap(result => (result.status === 'rejected' ? [result.reason] : [])))
}
if (failures.length === 1) throw failures[0]
if (failures.length > 1)
  throw new AggregateError(failures, 'MCP catalog generation or cleanup failed')
