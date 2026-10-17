import { describe, expect, it } from 'vitest'
import { insertTestCommunity } from '@voucha/test-helpers'
import { insertContentProvenanceOAuthClient } from '@voucha/test-helpers/data-stores/psql/content-provenance'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'

const scopes = ['community-moderation:read', 'community-moderation:write'] as const

describe('community moderation MCP settings write provenance — real PostgreSQL and Valkey', () => {
  it.each([
    ['update_community_settings', { name: `Updated ${crypto.randomUUID()}` }],
    ['update_post_type_settings', { should_allow_review_posts: true }],
  ] as const)(
    'returns public provenance without staff OAuth client details for %s',
    async (option, body) => {
      const administrator = await createTestPlusMcpCaller({ administrator: true })
      const metadataUrl = `https://client-${crypto.randomUUID()}.example/oauth/client.json`
      const clientRowId = await insertContentProvenanceOAuthClient({ metadataUrl })
      const community = await insertTestCommunity({
        createdById: administrator.id,
        provenance: { createdVia: 'mcp', oauthClientId: clientRowId },
      })

      const result = await callStructuredMcpTool(
        administrator,
        'update_community_moderation',
        optionArgs(option, { community: community.id, ...body }),
        scopes,
      )
      const returned = result.community as Record<string, unknown>
      expect(returned.id).toBe(community.id)
      expect(returned.provenance).toEqual({
        via: 'mcp',
        app: { kind: 'hostname', hostname: new URL(metadataUrl).hostname },
      })
      expect(returned).not.toHaveProperty('staff_provenance')
      expect(JSON.stringify(returned)).not.toContain(clientRowId)
      expect(JSON.stringify(returned)).not.toContain(metadataUrl)
    },
  )
})
