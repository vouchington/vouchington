import { it, expect, describe } from 'vitest'
import { buildAgentTools, withCurry, agentToolsToSchemas } from './build-agent-tools.mts'
import type { Tool } from '@voucha/tools'
import type { BasicUser } from '@services/users/types'

describe('build-agent-tools', () => {
  const mockUser = { id: 'user-1', roles: [] } as unknown as BasicUser

  function makeTool(name: string, withFormatResult = false): Tool {
    const tool: Tool = {
      schema: {
        name,
        type: 'function',
        description: `Tool ${name}`,
        parameters: { type: 'object', properties: {} },
        strict: null,
      },
      function: (_user: BasicUser) => (_args: unknown) => Promise.resolve({ result: name }),
    }
    if (withFormatResult) {
      tool.formatResult = (callId, result) => ({
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result),
      })
    }
    return tool
  }

  it('builds agentTools from simple tool list', () => {
    const toolA = makeTool('tool_a')
    const toolB = makeTool('tool_b')

    const { agentTools } = buildAgentTools(mockUser, [toolA, toolB])

    expect(agentTools).toHaveLength(2)
    expect(agentTools[0].schema.name).toBe('tool_a')
    expect(agentTools[1].schema.name).toBe('tool_b')
    expect(typeof agentTools[0].executor).toBe('function')
  })

  it('executor calls tool function with currentUser', async () => {
    let capturedUser: BasicUser | null = null
    const tool: Tool = {
      schema: { name: 'spy_tool', type: 'function', parameters: null, strict: null },
      function: (user: BasicUser) => (_args: unknown) => {
        capturedUser = user
        return Promise.resolve('ok')
      },
    }

    const { agentTools } = buildAgentTools(mockUser, [tool])
    await agentTools[0].executor({})

    expect(capturedUser).toBe(mockUser)
  })

  it('preserves formatResult when present', () => {
    const toolWithFormat = makeTool('formatted_tool', true)
    const toolWithout = makeTool('plain_tool', false)

    const { agentTools } = buildAgentTools(mockUser, [toolWithFormat, toolWithout])

    expect(typeof agentTools[0].formatResult).toBe('function')
    expect(agentTools[1].formatResult).toBeUndefined()
  })

  it('agentTools schemas are in order', () => {
    const toolA = makeTool('alpha')
    const toolB = makeTool('beta')

    const { agentTools } = buildAgentTools(mockUser, [toolA, toolB])

    expect(agentTools[0].schema.name).toBe('alpha')
    expect(agentTools[1].schema.name).toBe('beta')
  })

  it('supports tool with extra curry args', async () => {
    let capturedArgs: unknown[] = []

    const toolWithExtras: Tool<unknown, string, [string, string]> = {
      schema: { name: 'contextual_tool', type: 'function', parameters: null, strict: null },
      function: (user: BasicUser, entityType: string, entityId: string) => (_args: unknown) => {
        capturedArgs = [user, entityType, entityId]
        return Promise.resolve('done')
      },
    }

    const { agentTools } = buildAgentTools(mockUser, [
      { tool: toolWithExtras, curryArgs: ['post', 'entity-123'] },
    ])

    await agentTools[0].executor({})

    expect(capturedArgs[0]).toBe(mockUser)
    expect(capturedArgs[1]).toBe('post')
    expect(capturedArgs[2]).toBe('entity-123')
  })

  it('withCurry produces a type-safe curried entry equivalent to the object-literal form', async () => {
    let capturedArgs: unknown[] = []

    const tool: Tool<unknown, string, [string, string]> = {
      schema: { name: 'curry_tool', type: 'function', parameters: null, strict: null },
      function: (user: BasicUser, entityType: string, entityId: string) => (_args: unknown) => {
        capturedArgs = [user, entityType, entityId]
        return Promise.resolve('done')
      },
    }

    const entry = withCurry(tool, 'rss_feed_item', 'feed-456')
    expect(entry.tool).toBe(tool)
    expect(entry.curryArgs).toEqual(['rss_feed_item', 'feed-456'])

    const { agentTools } = buildAgentTools(mockUser, [entry])
    await agentTools[0].executor({})

    expect(capturedArgs[0]).toBe(mockUser)
    expect(capturedArgs[1]).toBe('rss_feed_item')
    expect(capturedArgs[2]).toBe('feed-456')
  })

  it('returns empty agentTools for empty input', () => {
    const { agentTools } = buildAgentTools(mockUser, [])
    expect(agentTools).toHaveLength(0)
  })

  it('throws when an admin-only tool is wired with a non-admin user', () => {
    const adminOnly: Tool = {
      ...makeTool('admin_only'),
      roles: { administrator: true, user: false },
    }
    expect(() => buildAgentTools(mockUser, [adminOnly])).toThrow(/admin_only/)
  })

  it('allows admin-only tool when currentUser has the administrator role', () => {
    const adminUser = { id: 'admin-1', roles: ['administrator'] } as unknown as BasicUser
    const adminOnly: Tool = {
      ...makeTool('admin_only'),
      roles: { administrator: true, user: false },
    }
    const { agentTools } = buildAgentTools(adminUser, [adminOnly])
    expect(agentTools).toHaveLength(1)
    expect(agentTools[0].schema.name).toBe('admin_only')
  })

  it('denies tools where the user role is not explicitly allowed', () => {
    const adminUser = { id: 'admin-1', roles: ['administrator'] } as unknown as BasicUser
    // roles defined but neither role set to true → both denied
    const tool: Tool = {
      ...makeTool('locked_down'),
      roles: { administrator: false, user: false },
    }
    expect(() => buildAgentTools(adminUser, [tool])).toThrow(/locked_down/)
    expect(() => buildAgentTools(mockUser, [tool])).toThrow(/locked_down/)
  })

  it('also enforces roles for tool entries with extra curry args', () => {
    const tool = {
      ...makeTool('curry_admin_only'),
      roles: { administrator: true, user: false },
      function:
        (_user: BasicUser, ..._extras: unknown[]) =>
        (_args: unknown) =>
          Promise.resolve('done'),
    } as unknown as Tool
    expect(() => buildAgentTools(mockUser, [{ tool, curryArgs: ['post', 'entity-1'] }])).toThrow(
      /curry_admin_only/,
    )
  })

  it('allows tools for explicitly configured custom roles', () => {
    const supportUser = { id: 'support-1', roles: ['customer_support'] } as unknown as BasicUser
    const supportTool: Tool = {
      ...makeTool('support_tool'),
      roles: { customer_support: true, administrator: true, user: false },
    }

    const { agentTools } = buildAgentTools(supportUser, [supportTool])

    expect(agentTools).toHaveLength(1)
    expect(agentTools[0].schema.name).toBe('support_tool')
  })

  it('agentToolsToSchemas returns schemas in order', () => {
    const toolA = makeTool('schema_a')
    const toolB = makeTool('schema_b')
    const { agentTools } = buildAgentTools(mockUser, [toolA, toolB])
    const schemas = agentToolsToSchemas(agentTools) as Array<{ name: string }>
    expect(schemas).toHaveLength(2)
    expect(schemas[0].name).toBe('schema_a')
    expect(schemas[1].name).toBe('schema_b')
  })
})
