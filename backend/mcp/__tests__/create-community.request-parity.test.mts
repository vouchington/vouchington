import { describe, expect, it } from 'vitest'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { getCommunityOrThrow } from '@services/communities'
import { RuntimeRequestValidatorRegistry } from '@services/runtime-request-validation'

const scopes = ['communities:read', 'communities:write'] as const

describe('create_community REST input parity', () => {
  it('accepts and persists the REST community fields and rejects unknown fields', async () => {
    const caller = await createTestPlusMcpCaller()
    const body = {
      name: 'Shared Community Input Contract',
      list_type: 'follow',
      member_roster_visibility: 'members',
      member_invites_allowed_at: true,
      post_approval_required_at: true,
      default_language: null,
      profile_image_id: null,
      banner_image_id: null,
    }
    expect(
      RuntimeRequestValidatorRegistry.shared.validateBody('POST:/api/v1/communities', body),
    ).toBeNull()
    const args = { ...body, idempotency_key: crypto.randomUUID() }
    const result = await callStructuredMcpTool(caller, 'create_community', args, scopes)
    const community = await getCommunityOrThrow((result.community as { id: string }).id)
    expect(community).toMatchObject({
      list_type: 'follow',
      member_roster_visibility: 'members',
      default_language: null,
    })
    expect(community.member_invites_allowed_at).toBeInstanceOf(Date)
    expect(community.post_approval_required_at).toBeInstanceOf(Date)
    expect(await callStructuredMcpTool(caller, 'create_community', args, scopes)).toEqual(result)
    expect(
      await callRejectedMcpTool(caller, 'create_community', { ...args, unexpected: true }, scopes),
    ).toMatch(/invalid/i)
    expect(
      RuntimeRequestValidatorRegistry.shared.validateBody('POST:/api/v1/communities', {
        ...body,
        unexpected: true,
      }),
    ).toEqual({ message: 'Invalid request body' })
  })
})
