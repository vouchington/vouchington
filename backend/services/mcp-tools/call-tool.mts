import { McpError, ErrorCode, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import onError from '@modules/on-error'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import {
  listToolsForSurface,
  isToolMcpEligible,
  isToolAllowedForPlan,
  getToolRequiredScopes,
} from '@voucha/tools/registry/select'
import { isToolAllowedForUser } from './authorization.mts'
import type { BasicUser } from '@services/users/types'
import type { McpServerConfig } from './config.mts'
import { hasEveryScope, type ApiScope } from '@modules/scopes'

type UserForCall = BasicUser & {
  membership_plan: 'plus' | 'pro' | null
}

export const MAX_MCP_TOOL_RESULT_BYTES = 1024 * 1024
export const MAX_MCP_TOOL_RESULT_VISITS = 100_000

class BoundedJsonSerializer {
  private readonly chunks: string[] = []
  private readonly ancestors = new Set<object>()
  private byteLength = 0
  private traversalSteps = 0
  private readonly maxBytes: number

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes
  }

  complete(): string {
    return this.chunks.join('')
  }

  serializeValue(value: unknown, key: string, arrayValue: boolean): boolean {
    this.countTraversalStep()
    const serializedValue = this.applyToJson(value, key)
    if (
      serializedValue === undefined ||
      typeof serializedValue === 'function' ||
      typeof serializedValue === 'symbol'
    ) {
      if (arrayValue) this.append('null')
      return arrayValue
    }

    if (serializedValue === null) {
      this.append('null')
      return true
    }
    if (typeof serializedValue === 'string') {
      this.assertInputFits(serializedValue)
      this.append(JSON.stringify(serializedValue))
      return true
    }
    if (typeof serializedValue === 'boolean') {
      this.append(serializedValue ? 'true' : 'false')
      return true
    }
    if (typeof serializedValue === 'number') {
      this.append(Number.isFinite(serializedValue) ? String(serializedValue) : 'null')
      return true
    }
    if (typeof serializedValue === 'bigint') {
      throw new TypeError('Do not know how to serialize a BigInt')
    }
    return this.serializeObject(serializedValue)
  }

  private applyToJson(value: unknown, key: string): unknown {
    if (value && typeof value === 'object' && 'toJSON' in value) {
      const toJson = (value as { toJSON?: unknown }).toJSON
      if (typeof toJson === 'function') {
        return toJson.call(value, key)
      }
    }
    return value
  }

  private serializeObject(value: object): boolean {
    if (this.ancestors.has(value)) {
      throw new TypeError('Converting circular structure to JSON')
    }
    this.ancestors.add(value)
    if (Array.isArray(value)) {
      this.append('[')
      for (let index = 0; index < value.length; index += 1) {
        if (index > 0) this.append(',')
        this.serializeValue(value[index], String(index), true)
      }
      this.append(']')
    } else {
      this.append('{')
      let wroteEntry = false
      for (const property in value) {
        if (Object.hasOwn(value, property)) {
          this.countTraversalStep()
          const chunkCount = this.chunks.length
          const previousByteLength = this.byteLength
          if (wroteEntry) this.append(',')
          this.assertInputFits(property)
          this.append(JSON.stringify(property))
          this.append(':')
          if (!this.serializeValue((value as Record<string, unknown>)[property], property, false)) {
            this.chunks.length = chunkCount
            this.byteLength = previousByteLength
            continue
          }
          wroteEntry = true
        } else {
          this.countTraversalStep()
        }
      }
      this.append('}')
    }
    this.ancestors.delete(value)
    return true
  }

  private assertInputFits(value: string) {
    if (Buffer.byteLength(value, 'utf8') > this.maxBytes) {
      throw new RangeError('Tool result exceeds the MCP response limit')
    }
  }

  private countTraversalStep() {
    this.traversalSteps += 1
    if (this.traversalSteps > MAX_MCP_TOOL_RESULT_VISITS) {
      throw new RangeError('Tool result exceeds the MCP response traversal limit')
    }
  }

  private append(value: string) {
    const nextLength = this.byteLength + Buffer.byteLength(value, 'utf8')
    if (nextLength > this.maxBytes) {
      throw new RangeError('Tool result exceeds the MCP response limit')
    }
    this.chunks.push(value)
    this.byteLength = nextLength
  }
}

export function serializeMcpToolResult(result: unknown): string {
  const serializer = new BoundedJsonSerializer(MAX_MCP_TOOL_RESULT_BYTES)
  if (!serializer.serializeValue(result, '', false)) {
    throw new TypeError('Tool result is not JSON serializable')
  }
  return serializer.complete()
}

export async function callMcpTool(
  toolName: string,
  args: unknown,
  user: UserForCall,
  permissions: readonly ApiScope[],
  config: McpServerConfig,
): Promise<CallToolResult> {
  const mcpSurface = listToolsForSurface(config.surface, ALL_TOOLS)
  const tool = mcpSurface.find(t => t.schema.name === toolName)

  if (!tool || !isToolMcpEligible(tool)) {
    throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${toolName}`)
  }

  if (!isToolAllowedForUser(tool, user)) {
    throw new McpError(ErrorCode.InvalidRequest, `Tool not allowed for your role: ${toolName}`)
  }

  if (!isToolAllowedForPlan(tool, user)) {
    throw new McpError(ErrorCode.InvalidRequest, `Tool requires a higher plan: ${toolName}`)
  }

  const requiredScopes = getToolRequiredScopes(tool, config.surface)
  if (requiredScopes == null || !hasEveryScope(permissions, requiredScopes)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Tool requires scopes ${requiredScopes?.join(', ') ?? 'unavailable'}: ${toolName}`,
    )
  }

  try {
    const result = await tool.function(user)(args as never)
    return {
      content: [{ type: 'text', text: serializeMcpToolResult(result) }],
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return {
      isError: true,
      content: [{ type: 'text', text: 'Tool execution failed. Please try again.' }],
    }
  }
}
