import type { Community, CommunityMetrics, CommunityWithOwner } from '@services/communities'
import { attachCommunityProvenance } from '@services/content-provenance'
import {
  toMcpCommunity,
  toMcpCommunityMetrics,
  toMcpCommunityOwner,
  type McpCommunityEntry,
} from './mcp-community-output.mts'

type CommunityEntryInput = {
  community: Community
  owner: CommunityWithOwner['owner']
  metrics: CommunityMetrics | null | undefined
}

/**
 * Maps communities with their owners and counts for MCP, attaching the public provenance label a
 * signed-out reader sees to every community in one batch. `staff_provenance` never reaches MCP.
 */
export async function toMcpCommunityEntries(
  entries: CommunityEntryInput[],
): Promise<McpCommunityEntry[]> {
  const communities = await attachCommunityProvenance(
    entries.map(entry => entry.community),
    null,
  )
  return Promise.all(
    entries.map(async (entry, index) => ({
      community: await toMcpCommunity(communities[index]!),
      owner: await toMcpCommunityOwner(entry.owner),
      metrics: toMcpCommunityMetrics(entry.metrics),
    })),
  )
}
