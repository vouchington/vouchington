import { describe, it, expect } from 'vitest'
import { toolToMcpTool } from './adapters.mts'
import type { Tool, ToolAnnotations } from '@services/openai-agents/tool-types'

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
      audience: 'user',
      title: 'Test Tool',
      requiredScopes: ['topics:read'],
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
    expect(result.title).toBe('Test Tool')
    expect(result['_meta']).toEqual({
      'voucha/requiredScopes': ['topics:read'],
    })
    expect('outputSchema' in result).toBe(false)
  })

  it('marks read-only tools idempotent', () => {
    const tool = makeToolWithAnnotations({
      readOnlyHint: true,
      openWorldHint: true,
    })
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

  it('publishes the declared output schema', () => {
    const outputSchema = {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
    } as const
    const tool = makeToolWithAnnotations({ readOnlyHint: true })
    const withSchema: Tool = {
      ...tool,
      meta: { ...tool.meta!, outputSchema },
    }

    expect(toolToMcpTool(withSchema).outputSchema).toEqual(outputSchema)
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
    expect(result.inputSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    })
  })
})
