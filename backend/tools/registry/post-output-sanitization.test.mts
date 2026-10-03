import { describe, expect, it } from 'vitest'
import { ALL_TOOLS } from './index.mts'

/** Find post-shaped records anywhere in a tool's inline output contract. */
function containsPost(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return false
  if (Array.isArray(schema)) return schema.some(containsPost)
  const object = schema as Record<string, unknown>
  const properties = object['properties'] as Record<string, unknown> | undefined
  if (properties?.['post_type'] && properties['title'] && properties['markdown']) return true
  return Object.values(object).some(containsPost)
}

describe('registered MCP post outputs', () => {
  it('routes every post or recommendation shape through a sanitizing transform', () => {
    const postTools = ALL_TOOLS.filter(
      tool => tool.meta?.surfaces?.includes('mcp') && containsPost(tool.meta.outputSchema),
    )
    expect(postTools.length).toBeGreaterThan(0)
    for (const tool of postTools) {
      const implementation = String(tool.function)
      const shared = /\b(toMcpPost|loadMcpPosts|toMcpRecommendation)\b/.test(implementation)
      const inlineSearch =
        /\bsanitizePromptInjection\b/.test(implementation) &&
        /\bwrapExternalContent\b/.test(implementation)
      expect({ tool: tool.schema.name, sanitized: shared || inlineSearch }).toEqual({
        tool: tool.schema.name,
        sanitized: true,
      })
    }
  })
})
