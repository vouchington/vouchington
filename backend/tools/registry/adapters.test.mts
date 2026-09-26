import { describe, it, expect } from 'vitest'
import { toolToMcpTool } from './adapters.mts'
import type { Tool, ToolAnnotations } from '../types.mts'

function makeToolWithAnnotations(annotations: ToolAnnotations): Tool {
  return {
    schema: {
      name: 'test_tool',
      type: 'function',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      strict: null,
    },
    function: (_user: unknown) => () => Promise.resolve({}),
    meta: {
      surfaces: ['mcp'],
      title: 'Test Tool',
      requiredScopes: { mcp: ['topics:read'] },
      annotations,
      api: null,
    },
  } as unknown as Tool
}

describe('toolToMcpTool', () => {
  it('maps name and description from schema', () => {
    const tool = makeToolWithAnnotations({ readOnlyHint: true })
    const result = toolToMcpTool(tool)
    expect(result.name).toBe('test_tool')
    expect(result.description).toBe('A test tool')
  })

  it('maps the display title from meta', () => {
    expect(toolToMcpTool(makeToolWithAnnotations({ readOnlyHint: true })).title).toBe('Test Tool')
  })

  it('marks read-only tools idempotent', () => {
    const tool = makeToolWithAnnotations({ readOnlyHint: true, openWorldHint: true })
    expect(toolToMcpTool(tool).annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    })
  })

  it('keeps the declared hints of write tools', () => {
    const tool = makeToolWithAnnotations({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    })
    expect(toolToMcpTool(tool).annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    })
  })

  it('includes canonical required scopes in MCP metadata', () => {
    const result = toolToMcpTool(makeToolWithAnnotations({ readOnlyHint: true }))
    expect(result['_meta']).toEqual({ 'voucha/requiredScopes': ['topics:read'] })
  })

  it('omits annotations and title when the tool has no meta', () => {
    const tool: Tool = {
      schema: {
        name: 'bare_tool',
        type: 'function',
        parameters: null,
        strict: null,
      },
      function: (_user: unknown) => () => Promise.resolve({}),
    } as unknown as Tool
    const result = toolToMcpTool(tool)
    expect('annotations' in result).toBe(false)
    expect('title' in result).toBe(false)
  })

  it('uses empty object schema when parameters is null', () => {
    const tool: Tool = {
      schema: {
        name: 'null_params',
        type: 'function',
        parameters: null,
        strict: null,
      },
      function: (_user: unknown) => () => Promise.resolve({}),
    } as unknown as Tool
    const result = toolToMcpTool(tool)
    expect(result.inputSchema).toEqual({ type: 'object', properties: {} })
  })
})
