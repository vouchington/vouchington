import { describe, expect, it, vi } from 'vitest'
import {
  buildToolResult,
  McpToolOutputMismatchError,
} from '../services/mcp-tools/build-tool-result.mts'
import { validateToolArguments } from '../services/mcp-tools/validate-tool-arguments.mts'
import { createMergedTool, type MergedToolSource } from './create-merged-tool.mts'

const routeA = { method: 'GET' as const, path: '/api/v1/examples/:id' }
const routeB = { method: 'GET' as const, path: '/api/v1/examples' }
const invocation = vi.fn<(option: string, args: unknown) => unknown>((option, args) => ({
  success: true,
  [option]: args,
}))

function source(option: 'get' | 'list'): MergedToolSource {
  const argumentsSchema =
    option === 'get'
      ? {
          type: 'object',
          properties: { id: { $ref: '#/$defs/Id' } },
          required: ['id'],
          $defs: { Id: { type: 'string', minLength: 1 } },
        }
      : {
          type: 'object',
          properties: { after: { $ref: '#/$defs/Id' } },
          $defs: { Id: { type: 'string', minLength: 1 } },
        }
  return {
    schema: {
      description: `${option} example`,
      parameters: argumentsSchema,
    },
    function: _user => args => invocation(option, args),
    meta: {
      surfaces: ['internal', 'mcp'],
      title: `${option} example`,
      plan: 'free',
      requiredScopes: { mcp: ['topics:read'] },
      annotations: { readOnlyHint: true },
      api: [option === 'get' ? routeA : routeB],
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          [option]: { $ref: '#/$defs/Result' },
        },
        required: ['success', option],
        additionalProperties: false,
        $defs: {
          Result: {
            type: 'object',
            properties:
              option === 'get' ? { id: { type: 'string' } } : { after: { type: 'string' } },
            additionalProperties: false,
          },
        },
      },
    },
  }
}

const merged = createMergedTool('read_example', 'Read Example', [
  { option: 'get', source: source('get') },
  { option: 'list', source: source('list') },
])

describe('createMergedTool', () => {
  it('closes the envelope and each source contract before dispatch', async () => {
    invocation.mockClear()
    for (const args of [
      { option: 'other', arguments: {} },
      { option: 'get', arguments: { after: 'cursor' } },
      { option: 'list', arguments: { id: 'one' } },
      { option: 'get', arguments: { id: 'one' }, extra: true },
      { option: 'get', arguments: { id: 'one', extra: true } },
      { option: 'get' },
    ]) {
      expect(validateToolArguments(merged.schema.parameters, args)).not.toBeNull()
      expect(() => merged.function({} as never)(args)).toThrow('Invalid merged tool arguments')
    }
    expect(invocation).not.toHaveBeenCalled()
    const args = { option: 'get', arguments: { id: 'one' } }
    expect(validateToolArguments(merged.schema.parameters, args)).toBeNull()
    expect(await merged.function({} as never)(args)).toEqual({ success: true, get: { id: 'one' } })
    expect(invocation).toHaveBeenCalledExactlyOnceWith('get', { id: 'one' })
  })

  it('selects only the chosen REST route and source output contract', () => {
    const args = { option: 'list', arguments: { after: 'cursor' } }
    expect(merged.meta?.selectApi?.(args)).toEqual([routeB])
    expect(merged.meta?.auditOption?.(args)).toBe('list')
    expect(
      buildToolResult(
        merged.schema.name,
        { success: true, list: { after: 'cursor' } },
        merged.meta?.outputSchema,
        merged.meta?.selectOutputSchema?.(args),
      ).structuredContent,
    ).toEqual({ success: true, list: { after: 'cursor' } })
    expect(() =>
      buildToolResult(
        merged.schema.name,
        { success: true, get: { id: 'one' } },
        merged.meta?.outputSchema,
        merged.meta?.selectOutputSchema?.(args),
      ),
    ).toThrow(McpToolOutputMismatchError)
  })

  it('rejects incompatible declared metadata', () => {
    const different = source('list')
    different.meta.plan = 'plus'
    expect(() =>
      createMergedTool('read_example', 'Read Example', [
        { option: 'get', source: source('get') },
        { option: 'list', source: different },
      ]),
    ).toThrow('incompatible declared metadata')
  })
})
