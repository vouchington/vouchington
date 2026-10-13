import { write } from '@data-stores/psql'
import type { LoadedCommunity } from '@services/communities/load-with-viewer'
import type { Community, CommunityMember } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { isBaselineModeratorSlug } from '@services/agents/moderator-configs'
import {
  getCommunityAiAgentEntitlement,
  type CommunityAiAgentEntitlement,
} from './community-agent-entitlements.mts'
import {
  getAgentIdByModeratorSlug,
  getCommunityAutoTaggerAgentRows,
  isCommunityAutoTaggerAgentSlug,
  mapCommunityAutoTaggerAgent,
  type CommunityAutoTaggerAgent,
} from './community-auto-tagger-data.mts'

export { type CommunityAutoTaggerAgent } from './community-auto-tagger-data.mts'

type LoadedViewer = Pick<LoadedCommunity, 'community' | 'membership'>

export async function searchCommunityAutoTaggerAgents(
  currentUser: PrivateUser,
  { community, membership }: LoadedViewer,
): Promise<CommunityAutoTaggerAgent[]> {
  const rows = await getCommunityAutoTaggerAgentRows(community.id)
  return rows.map(row => {
    const entitlement = getCommunityAiAgentEntitlement(
      currentUser,
      community,
      membership,
      isBaselineModeratorSlug(row.slug),
    )
    return mapCommunityAutoTaggerAgent(row, entitlement)
  })
}

export async function enableCommunityAutoTaggerAgent(
  currentUser: PrivateUser,
  loaded: LoadedViewer,
  moderatorSlug: string,
): Promise<CommunityAutoTaggerAgent> {
  const { community, membership, agentId } = await loadManagementTarget(
    currentUser,
    loaded,
    moderatorSlug,
  )
  const entitlement = getCommunityAiAgentEntitlement(
    currentUser,
    community,
    membership,
    isBaselineModeratorSlug(moderatorSlug),
  )
  assert(entitlement.allowed, 403, entitlement.reason ?? 'Community AI agent access is unavailable')

  await write(sql`/* enableCommunityAutoTaggerAgent */
    INSERT INTO community_auto_tagger_agents (
      community_id,
      agent_id,
      enabled_by_id,
      enabled_at,
      disabled_at,
      disabled_by_id
    )
    VALUES (${community.id}, ${agentId}, ${currentUser.id}, CURRENT_TIMESTAMP, NULL, NULL)
    ON CONFLICT (community_id, agent_id) DO UPDATE SET
      enabled_at = CURRENT_TIMESTAMP,
      enabled_by_id = EXCLUDED.enabled_by_id,
      disabled_at = NULL,
      disabled_by_id = NULL
    WHERE community_auto_tagger_agents.disabled_at IS NOT NULL
  `)

  return getCommunityAutoTaggerAgentOrThrow(community.id, moderatorSlug, entitlement)
}

export async function disableCommunityAutoTaggerAgent(
  currentUser: PrivateUser,
  loaded: LoadedViewer,
  moderatorSlug: string,
): Promise<CommunityAutoTaggerAgent> {
  const { community, membership, agentId } = await loadManagementTarget(
    currentUser,
    loaded,
    moderatorSlug,
  )
  const entitlement = getCommunityAiAgentEntitlement(
    currentUser,
    community,
    membership,
    isBaselineModeratorSlug(moderatorSlug),
  )
  assert(entitlement.allowed, 403, entitlement.reason ?? 'Community AI agent access is unavailable')

  // A first-time disable creates a disabled row for idempotence; no user enabled it yet.
  await write(sql`/* disableCommunityAutoTaggerAgent */
    INSERT INTO community_auto_tagger_agents (
      community_id,
      agent_id,
      enabled_by_id,
      disabled_at,
      disabled_by_id
    )
    VALUES (${community.id}, ${agentId}, NULL, CURRENT_TIMESTAMP, ${currentUser.id})
    ON CONFLICT (community_id, agent_id) DO UPDATE SET
      disabled_at = CURRENT_TIMESTAMP,
      disabled_by_id = EXCLUDED.disabled_by_id
    WHERE community_auto_tagger_agents.disabled_at IS NULL
  `)

  return getCommunityAutoTaggerAgentOrThrow(community.id, moderatorSlug, entitlement)
}

async function loadManagementTarget(
  currentUser: PrivateUser,
  { community, membership }: LoadedViewer,
  moderatorSlug: string,
): Promise<{ community: Community; membership: CommunityMember | null; agentId: string }> {
  assert(isCommunityAutoTaggerAgentSlug(moderatorSlug), 404, 'AI agent not found')

  assert(!community.archived_at, 403, 'Community is archived')
  const entitlement = getCommunityAiAgentEntitlement(
    currentUser,
    community,
    membership,
    isBaselineModeratorSlug(moderatorSlug),
  )
  assert(entitlement.allowed, 403, entitlement.reason ?? 'Forbidden')

  const agentId = await getAgentIdByModeratorSlug(moderatorSlug)
  assert(agentId, 404, 'AI agent not found')

  return { community, membership, agentId }
}

async function getCommunityAutoTaggerAgentOrThrow(
  communityId: string,
  moderatorSlug: string,
  entitlement: CommunityAiAgentEntitlement,
): Promise<CommunityAutoTaggerAgent> {
  const row = (await getCommunityAutoTaggerAgentRows(communityId)).find(
    r => r.slug === moderatorSlug,
  )
  assert(row, 404, 'AI agent not found')
  return mapCommunityAutoTaggerAgent(row, entitlement)
}
