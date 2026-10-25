import { describe, expect, it } from 'vitest'
import { createMergedTool, type MergedToolSource } from './create-merged-tool.mts'
import { toolToMcpTool } from './registry/adapters.mts'

function source(option: 'get' | 'list'): MergedToolSource {
  return {
    schema: {
      description: `${option} example`,
      parameters: { type: 'object', properties: { id: { type: 'string' } } },
    },
    function: _user => args => ({ success: true, [option]: args }),
    meta: {
      audience: 'user',
      title: `${option} example`,
      plan: 'free',
      requiredScopes: ['topics:read'],
      annotations: { readOnlyHint: true },
      api: [{ method: 'GET', path: `/api/v1/examples/${option}` }],
      outputSchema: {
        type: 'object',
        properties: { success: { type: 'boolean' }, [option]: { type: 'object' } },
        required: ['success', option],
        additionalProperties: false,
      },
    },
  }
}

describe('createMergedTool', () => {
  it('advertises the selected output pointer of every option', () => {
    const tool = createMergedTool('read_example', 'Read Example', [
      { option: 'get', source: source('get') },
      { option: 'list', source: source('list') },
    ])

    expect(toolToMcpTool(tool)['_meta']?.['voucha/optionOutputPointers']).toEqual({
      get: '#/anyOf/0',
      list: '#/anyOf/1',
    })
  })

  it.each(['plan', 'scopes', 'audience', 'roles', 'annotations', 'switch'] as const)(
    'rejects incompatible declared %s metadata',
    field => {
      const different = source('list')
      if (!different.meta) throw new Error('missing source meta')
      if (field === 'plan') different.meta.plan = 'plus'
      if (field === 'scopes') different.meta.requiredScopes = ['posts:read']
      if (field === 'audience') different.meta.audience = 'admin'
      if (field === 'roles') different.roles = { administrator: true }
      if (field === 'annotations')
        different.meta.annotations = {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
        }
      if (field === 'switch') different.meta.switch = 'copyright.mcpDecisionTools'
      expect(() =>
        createMergedTool('read_example', 'Read Example', [
          { option: 'get', source: source('get') },
          { option: 'list', source: different },
        ]),
      ).toThrow('incompatible declared metadata')
    },
  )
})
