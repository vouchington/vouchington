import { describe, it, expect } from 'vitest'
import { toolToMcpTool } from './adapters.mts'
import type { Tool } from '../types.mts'

function makeToolWithAnnotations(
  annotations?: Partial<{
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: boolean
  }>,
): Tool {
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
      requiredScopes: { mcp: ['topics:read'] },
      annotations: annotations as NonNullable<Tool['meta']>['annotations'],
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

  it('includes annotations when present', () => {
    const tool = makeToolWithAnnotations({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    })
    const result = toolToMcpTool(tool)
    expect(result.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    })
  })

  it('includes canonical required scopes in MCP metadata', () => {
    const result = toolToMcpTool(makeToolWithAnnotations({ readOnlyHint: true }))
    expect(result['_meta']).toEqual({ 'voucha/requiredScopes': ['topics:read'] })
  })

  it('omits annotations key when meta has no annotations', () => {
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
