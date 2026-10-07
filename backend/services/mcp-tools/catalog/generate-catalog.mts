import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Tool } from '@services/openai-agents/tool-types'
import { format } from 'oxfmt'
import { renderCatalogTable, spliceCatalogTable } from './agent-tool-catalog.mts'
import { buildMcpCatalog } from './build-mcp-catalog.mts'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const toJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

async function generate(
  rawArgs: readonly string[],
  root: string,
  tools: readonly Tool[],
): Promise<void> {
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs
  const repoPath = (path: string): string => join(root, path)
  if (args.some(arg => arg !== '--check') || args.length > 1)
    throw new Error('Usage: pnpm run mcp:catalog [--check]')
  const check = args.includes('--check')
  const markdownPath = repoPath('docs/overview/architecture/mcp/catalog.md')
  const artifacts = [
    { path: repoPath('api-fixtures/v1/mcp.json'), raw: toJson(buildMcpCatalog(tools)) },
    {
      path: markdownPath,
      raw: spliceCatalogTable(await readFile(markdownPath, 'utf8'), renderCatalogTable(tools)),
    },
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

/** Generate artifacts and release only the resources owned by this invocation. */
export async function runCatalogGeneration(
  args: readonly string[],
  {
    root = repoRoot,
    closeResources,
    ready,
    tools,
  }: {
    root?: string
    tools: readonly Tool[]
    ready: Promise<void>
    closeResources: readonly (() => Promise<void>)[]
  },
): Promise<void> {
  const failures: unknown[] = []
  try {
    await ready
    await generate(args, root, tools)
  } catch (err) {
    failures.push(err)
  } finally {
    const results = await Promise.allSettled(
      closeResources.map(close => Promise.resolve().then(close)),
    )
    failures.push(
      ...results.flatMap(result => (result.status === 'rejected' ? [result.reason] : [])),
    )
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1)
    throw new AggregateError(failures, 'MCP catalog generation or cleanup failed')
}
