import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { optionMcpResultCases } from '@voucha/test-helpers/native-mcp-option-result-cases'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { updateProfileMarkdown } from '@services/my/profile'
import { createProfileLink } from '@services/my/profile-links'

const fixture = (suffix: string) => optionMcpResultCases.find(entry => entry.id.endsWith(suffix))!

describe('selected MCP result fixtures through real handlers', () => {
  it('emits the bio case with the actual caller identity', async () => {
    const user = await createTestUser()
    const example = fixture('read-my-profile.bio')
    await updateProfileMarkdown(user.id, 'Example bio')
    const actual = await callStructuredMcpTool(
      { ...user, membership_plan: null },
      example.tool,
      example.arguments,
      ['profile:read'],
    )
    const profile = actual['profile'] as Record<string, unknown>
    expect(profile['id']).toBe(user.id)
    profile['id'] = (example.structuredContent['profile'] as Record<string, unknown>)['id']
    expect(actual).toEqual(example.structuredContent)
  })

  it('emits the links case with nullable fields and a factual link type', async () => {
    const user = await createTestUser()
    const link = await createProfileLink(user.id, { link_type: 'github', handle: 'example' })
    const example = fixture('read-my-profile.links')
    const actual = await callStructuredMcpTool(
      { ...user, membership_plan: null },
      example.tool,
      example.arguments,
      ['profile:read'],
    )
    const [row] = actual['results'] as Record<string, unknown>[]
    expect(row!['id']).toBe(link.id)
    expect(row!['user_id']).toBe(user.id)
    const expected = (example.structuredContent['results'] as Record<string, unknown>[])[0]!
    for (const key of ['created_at', 'updated_at']) {
      expect(Number.isNaN(Date.parse(row![key] as string))).toBe(false)
      row![key] = expected[key]
    }
    row!['id'] = expected['id']
    row!['user_id'] = expected['user_id']
    expect(actual).toEqual(example.structuredContent)
  })
})
