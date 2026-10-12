import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import type { Tool, ToolOutputSchema } from '@services/openai-agents/tool-types'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { createTestUser } from '@voucha/test-helpers'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildToolResult, McpToolOutputMismatchError } from './build-tool-result.mts'
import { buildMcpCatalog } from './catalog/build-mcp-catalog.mts'
import { findCatalogContractViolations } from './catalog/check-catalog-contracts.mts'
import { runCatalogGeneration } from './catalog/generate-catalog.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'
import { handleMcpHttpRequest } from './handle-request.mts'
import { listMcpToolsForUser } from './list-tools.mts'

// Deliberately reuse the definition name with different shapes. References resolve inside
// each schema, not a shared namespace between the input, output or other catalog tools.
const inputSchema = {
  type: 'object',
  properties: { arguments: { $ref: '#/$defs/item' } },
  required: ['arguments'],
  additionalProperties: false,
  $defs: {
    item: {
      type: 'object',
      properties: { id: { type: 'string', minLength: 1 } },
      required: ['id'],
      additionalProperties: false,
    },
  },
}
const outputSchema: ToolOutputSchema = {
  type: 'object',
  properties: { result: { $ref: '#/$defs/item' } },
  required: ['result'],
  additionalProperties: false,
  $defs: {
    item: {
      type: 'object',
      properties: { id: { type: 'string', minLength: 1 }, status: { enum: ['found'] } },
      required: ['id', 'status'],
      additionalProperties: false,
    },
  },
}
const invoke = vi.fn<(args: unknown) => { result: { id: string; status: string } }>(args => {
  const { arguments: item } = args as { arguments: { id: string } }
  return { result: { id: item.id, status: 'found' } }
})
const fixture: Tool = {
  schema: {
    name: 'local_schema_reference_fixture',
    type: 'function',
    description: 'Read one synthetic item.',
    parameters: inputSchema,
    strict: null,
  },
  function: _currentUser => invoke,
  meta: {
    title: 'Local schema reference fixture',
    surfaces: ['mcp'],
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: null,
    outputSchema,
  },
}

describe('tool-local schema references', () => {
  let client: Client

  beforeAll(async () => {
    const user = { ...(await createTestUser()), membership_plan: null }
    ;(ALL_TOOLS as Tool[]).push(fixture)
    client = new Client({ name: 'voucha-reference-contract-test', version: '1.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://localhost/api/v1/mcp'), {
        // Exercise our actual stateless HTTP handler with the SDK's wire protocol and
        // serialization, without opening a socket or starting the web stack.
        fetch: async (input, init) => {
          const request = new Request(input, init)
          if (request.method !== 'POST') return new Response(null, { status: 405 })
          const parsedBody: unknown = await request.clone().json()
          return handleMcpHttpRequest({
            request,
            parsedBody,
            user,
            permissions: ['topics:read'],
            config: USER_MCP_SERVER_CONFIG,
            rateLimitedCalls: new Map(),
          })
        },
      }),
    )
  })

  afterAll(async () => {
    try {
      await client?.close()
    } finally {
      const tools = ALL_TOOLS as Tool[]
      const index = tools.indexOf(fixture)
      if (index !== -1) tools.splice(index, 1)
    }
  })

  it('preserves both schemas over an official SDK client round trip', async () => {
    const listing = await client.listTools()
    const listed = listing.tools.find(tool => tool.name === fixture.schema.name)
    expect(listed?.inputSchema).toEqual(inputSchema)
    expect(listed?.outputSchema).toEqual(outputSchema)
    const result = await client.callTool({
      name: fixture.schema.name,
      arguments: { arguments: { id: 'owned-item' } },
    })
    expect(result).toEqual({
      content: [{ type: 'text', text: '{"result":{"id":"owned-item","status":"found"}}' }],
      structuredContent: { result: { id: 'owned-item', status: 'found' } },
    })
  })

  it('rejects invalid referenced arguments before invoking the tool', async () => {
    invoke.mockClear()
    for (const args of [
      { arguments: { id: 42 } },
      { arguments: { id: '' } },
      { arguments: {} },
      { arguments: { id: 'owned-item', unknown: true } },
      { arguments: { id: 'owned-item' }, unknown: true },
    ]) {
      await expect(
        client.callTool({ name: fixture.schema.name, arguments: args }),
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
    }
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects invalid structured content using its own schema-local definitions', async () => {
    for (const result of [
      { result: { id: 'owned-item' } },
      { result: { id: 'owned-item', status: 'invalid' } },
      { result: { id: 42, status: 'found' } },
      { result: { id: 'owned-item', status: 'found', unknown: true } },
    ]) {
      expect(() => buildToolResult(fixture.schema.name, result, outputSchema)).toThrow(
        McpToolOutputMismatchError,
      )
    }
    invoke.mockReturnValueOnce({ result: { id: 'owned-item', status: 'invalid' } })
    const rejected = await client.callTool({
      name: fixture.schema.name,
      arguments: { arguments: { id: 'owned-item' } },
    })
    expect(rejected).toMatchObject({ isError: true })
    expect(rejected).not.toHaveProperty('structuredContent')
  })

  it('preserves references in generated catalog artifacts and checks listing parity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mcp-reference-catalog-'))
    try {
      const markdown = join(root, 'docs/overview/architecture/mcp/catalog.md')
      await mkdir(join(root, 'api-fixtures/v1'), { recursive: true })
      await mkdir(join(markdown, '..'), { recursive: true })
      await writeFile(markdown, '# Catalog\n\n<!-- BEGIN GENERATED -->\n\n<!-- END GENERATED -->\n')
      const options = {
        root,
        tools: [fixture],
        cases: [],
        ready: Promise.resolve(),
        closeResources: [],
      }
      await runCatalogGeneration([], options)
      await runCatalogGeneration(['--check'], options)
      const catalog = JSON.parse(await readFile(join(root, 'api-fixtures/v1/mcp.json'), 'utf8'))
      expect(catalog).toEqual(buildMcpCatalog([fixture]))
      expect(catalog.servers[0].tools[0].tool).toMatchObject({ inputSchema, outputSchema })
      const list: Parameters<typeof findCatalogContractViolations>[1] = (...args) =>
        listMcpToolsForUser(...args).filter(tool => tool.name === fixture.schema.name)
      expect(findCatalogContractViolations([fixture], list, 0)).toEqual([])
      const droppedDefinitions: typeof list = (...args) =>
        list(...args).map(tool => ({ ...tool, inputSchema: { ...inputSchema, $defs: undefined } }))
      expect(findCatalogContractViolations([fixture], droppedDefinitions, 0)).toContain(
        'voucha-user-mcp catalog differs from tools/list',
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
