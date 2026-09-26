import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
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
})
