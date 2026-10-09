import { describe, expect, it } from 'vitest'
import { ALL_TOOLS } from './index.mts'
import { userMergedAccountGroups } from './user-merged-account-tools.mts'
import { userMergedParticipationGroups } from './user-merged-participation-tools.mts'
import { userMergedReadingGroups } from './user-merged-reading-tools.mts'

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
    const groups = [
      ...userMergedAccountGroups,
      ...userMergedParticipationGroups,
      ...userMergedReadingGroups,
    ]
    const postTools = ALL_TOOLS.filter(tool => tool.meta?.surfaces?.includes('mcp'))
      .flatMap(tool => {
        const group = groups.find(group => group.name === tool.schema.name)
        const options = group?.options ?? [{ option: null, source: tool }]
        return options.map(({ option, source }) => ({
          name: option ? `${tool.schema.name}(${option})` : tool.schema.name,
          function: source.function,
          outputSchema: source.meta?.outputSchema,
        }))
      })
      .filter(tool => containsPost(tool.outputSchema))
    expect(postTools.length).toBeGreaterThan(0)
    for (const tool of postTools) {
      const implementation = String(tool.function)
      const shared = /\b(toMcpPosts?|toWrittenMcpPost|loadMcpPosts|toMcpRecommendation)\b/.test(
        implementation,
      )
      const inlineSearch =
        /\bsanitizePromptInjection\b/.test(implementation) &&
        /\bwrapExternalContent\b/.test(implementation)
      expect({ tool: tool.name, sanitized: shared || inlineSearch }).toEqual({
        tool: tool.name,
        sanitized: true,
      })
    }
  })
})
