import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import { isToolMcpEligible, listToolsForSurface } from '@voucha/tools/registry/select'
import { format } from 'oxfmt'
import { describe, expect, it } from 'vitest'
import { ADMIN_MCP_SERVER_CONFIG, USER_MCP_SERVER_CONFIG } from '../config.mts'
import { listMcpToolsForUser } from '../list-tools.mts'
import {
  buildClientManifest,
  renderCatalogTable,
  spliceCatalogTable,
} from './agent-tool-catalog.mts'
import {
  buildMcpCatalog,
  findMissingApiOperations,
  type OpenApiPaths,
} from './build-mcp-catalog.mts'
import { findApiHintConflicts } from './find-api-hint-conflicts.mts'

const repoPath = (path: string): string =>
  fileURLToPath(new URL(`../../../../${path}`, import.meta.url))
const MCP_CATALOG_PATH = repoPath('api-fixtures/v1/mcp.json')
const OPENAPI_PATH = repoPath('api-fixtures/v1/openapi.json')
const CATALOG_MARKDOWN_PATH = repoPath('docs/overview/architecture/agent-tools/catalog.md')
const CLIENT_MANIFEST_PATH = repoPath('backend/tools/manifest.json')

async function formatted(path: string, raw: string): Promise<string> {
  const result = await format(path, raw)
  expect(result.errors).toEqual([])
  return result.code
}

const toJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

// Regenerate every artifact below with `pnpm run mcp:catalog`.
describe('generated MCP catalog artifacts', () => {
  const catalog = buildMcpCatalog(ALL_TOOLS)

  it('the production CLI verifies the published artifacts without changing them', async () => {
    const paths = [MCP_CATALOG_PATH, CATALOG_MARKDOWN_PATH, CLIENT_MANIFEST_PATH]
    const before = await Promise.all(paths.map(path => readFile(path, 'utf8')))
    await promisify(execFile)(process.execPath, [
      repoPath('backend/services/mcp-tools/catalog/generate.mts'),
      '--check',
    ])
    expect(await Promise.all(paths.map(path => readFile(path, 'utf8')))).toEqual(before)
  })

  it('api-fixtures/v1/mcp.json matches the registry', async () => {
    await expect(await formatted(MCP_CATALOG_PATH, toJson(catalog))).toMatchFileSnapshot(
      MCP_CATALOG_PATH,
    )
  })

  it('the agent tool catalog table matches the registry', async () => {
    const markdown = spliceCatalogTable(
      await readFile(CATALOG_MARKDOWN_PATH, 'utf8'),
      renderCatalogTable(ALL_TOOLS),
    )
    await expect(await formatted(CATALOG_MARKDOWN_PATH, markdown)).toMatchFileSnapshot(
      CATALOG_MARKDOWN_PATH,
    )
  })

  it('backend/tools/manifest.json matches the registry', async () => {
    const manifest = toJson(buildClientManifest(ALL_TOOLS))
    await expect(await formatted(CLIENT_MANIFEST_PATH, manifest)).toMatchFileSnapshot(
      CLIENT_MANIFEST_PATH,
    )
  })

  it.each([USER_MCP_SERVER_CONFIG, ADMIN_MCP_SERVER_CONFIG])(
    'lists what $serverName tools/list returns for a caller who passes every gate',
    config => {
      const everyRole = [...new Set(ALL_TOOLS.flatMap(tool => Object.keys(tool.roles ?? {})))]
      const everyScope = Object.keys(SCOPE_DEFINITIONS) as ApiScope[]
      const listed = listMcpToolsForUser(
        { id: 'mcp-catalog', roles: everyRole, membership_plan: 'pro' },
        everyScope,
        config,
      )
      const registered = listToolsForSurface(config.surface, ALL_TOOLS)
        .filter(tool => isToolMcpEligible(tool))
        .map(tool => tool.schema.name)
      const server = catalog.servers.find(entry => entry.name === config.serverName)

      expect(listed.map(tool => tool.name)).toEqual(registered)
      expect(server?.tools.map(entry => entry.tool)).toEqual(listed)
    },
  )

  it('names only REST equivalents that exist in the OpenAPI document', async () => {
    const openapi = JSON.parse(await readFile(OPENAPI_PATH, 'utf8')) as OpenApiPaths

    expect(findMissingApiOperations(ALL_TOOLS, openapi)).toEqual([])
  })

  it('declares hints that agree with each tool REST equivalents', () => {
    expect(findApiHintConflicts(ALL_TOOLS)).toEqual([])
  })

  it('gives every tool exposed on an MCP surface an output schema', () => {
    // A new MCP tool declares `meta.outputSchema` (see backend/tools/route-response-schema.mts)
    // from the start; there is no list of tools that may skip it.
    const exposed = ALL_TOOLS.filter(tool =>
      (tool.meta?.surfaces ?? []).some(surface => surface === 'mcp' || surface === 'admin_mcp'),
    )
    const listed = catalog.servers.flatMap(server => server.tools)

    expect(exposed.length).toBeGreaterThan(0)
    expect(exposed.filter(tool => !tool.meta?.outputSchema).map(tool => tool.schema.name)).toEqual(
      [],
    )
    expect(listed.filter(({ tool }) => !tool.outputSchema).map(({ tool }) => tool.name)).toEqual([])
  })

  it('gives every listed tool a display title', () => {
    const untitled = catalog.servers
      .flatMap(server => server.tools)
      .filter(({ tool }) => !tool.title?.trim())
      .map(({ tool }) => tool.name)

    expect(untitled).toEqual([])
  })
})
