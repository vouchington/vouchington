/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- This pure catalog check uses the DB/Valkey-free project selected by the .no-data.mock suffix. */
import type { Tool, ToolAnnotations, ToolApiEndpoint } from '@voucha/tools/types'
import { describe, expect, it } from 'vitest'
import { findApiHintConflicts } from './find-api-hint-conflicts.mts'

const READ: ToolAnnotations = { readOnlyHint: true }
const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
const IDEMPOTENT_WRITE: ToolAnnotations = { ...WRITE, idempotentHint: true }

function fixtureTool(
  name: string,
  annotations?: ToolAnnotations,
  methods?: ToolApiEndpoint['method'][],
): Tool {
  const api = methods?.map(method => ({ method, path: `/api/v1/${name}` })) ?? null
  return {
    schema: { name, type: 'function', description: null, parameters: null, strict: null },
    function: (_user: unknown) => () => ({}),
    ...(annotations ? { meta: { surfaces: ['mcp'], title: name, annotations, api } } : {}),
  } as unknown as Tool
}

describe('findApiHintConflicts', () => {
  it('accepts hints that agree with the named REST methods', () => {
    expect(
      findApiHintConflicts([
        fixtureTool('no_meta'),
        fixtureTool('no_api', WRITE),
        fixtureTool('empty_api', READ, []),
        fixtureTool('read', READ, ['GET', 'GET']),
        fixtureTool('write', WRITE, ['POST', 'PATCH', 'DELETE']),
        fixtureTool('idempotent_write', IDEMPOTENT_WRITE, ['PUT', 'DELETE']),
      ]),
    ).toEqual([])
  })

  it('reports hints that disagree with the named REST methods', () => {
    expect(
      findApiHintConflicts([
        fixtureTool('read_posts', READ, ['GET', 'POST']),
        fixtureTool('write_gets', IDEMPOTENT_WRITE, ['GET', 'PUT']),
        fixtureTool('idempotent_posts', IDEMPOTENT_WRITE, ['POST']),
        fixtureTool('non_idempotent_puts', WRITE, ['PUT']),
      ]),
    ).toEqual([
      { tool: 'read_posts', conflict: 'a read-only tool names a non-GET operation' },
      { tool: 'write_gets', conflict: 'a write tool names a GET operation' },
      { tool: 'idempotent_posts', conflict: 'idempotentHint should be false' },
      { tool: 'non_idempotent_puts', conflict: 'idempotentHint should be true' },
    ])
  })
})
