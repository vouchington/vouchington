import { read, write } from '@data-stores/psql'
import { getCommunity } from '@services/communities/get'
import { getCommunityMember } from '@services/communities/members/get'
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

export {
  getDisabledCommunityAutoTaggerModeratorSlugs,
  getEnabledCommunityAutoTaggerModeratorSlugs,
  type CommunityAutoTaggerAgent,
} from './community-auto-tagger-data.mts'

export async function searchCommunityAutoTaggerAgents(
  currentUser: PrivateUser,
  communityId: string,
  membership?: CommunityMember | null,
): Promise<CommunityAutoTaggerAgent[]> {
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  const resolvedMembership =
    membership !== undefined ? membership : await getCommunityMember(community.id, currentUser.id)
  const rows = await getCommunityAutoTaggerAgentRows(community.id)
  return rows.map(row => {
    const entitlement = getCommunityAiAgentEntitlement(
      currentUser,
      community,
      resolvedMembership,
      isBaselineModeratorSlug(row.slug),
    )
    return mapCommunityAutoTaggerAgent(row, entitlement)
  })
}

export async function assertCommunityAutoTaggerAgentEnabled(
  communityId: string | null | undefined,
  moderatorSlug: string,
): Promise<boolean> {
  if (!communityId) return false
  if (!isCommunityAutoTaggerAgentSlug(moderatorSlug)) return false

  const { rows } = await read(sql`/* assertCommunityAutoTaggerAgentEnabled */
    SELECT 1
    FROM community_auto_tagger_agents cata
    JOIN agents__moderators am ON am.agent_id = cata.agent_id
    JOIN agents a ON a.id = cata.agent_id
    WHERE cata.community_id = ${communityId}
      AND am.slug = ${moderatorSlug}
      AND cata.disabled_at IS NULL
      AND a.agent_type = 'moderator'
      AND a.activated_at IS NOT NULL
      AND a.deactivated_at IS NULL
      AND a.deleted_at IS NULL
    LIMIT 1
  `)

  return rows.length > 0
}

export async function enableCommunityAutoTaggerAgent(
  currentUser: PrivateUser,
  communityId: string,
  moderatorSlug: string,
): Promise<CommunityAutoTaggerAgent> {
  const { community, membership, agentId } = await loadManagementTarget(
    currentUser,
    communityId,
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
  communityId: string,
  moderatorSlug: string,
): Promise<CommunityAutoTaggerAgent> {
  const { community, membership, agentId } = await loadManagementTarget(
    currentUser,
    communityId,
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
  communityId: string,
  moderatorSlug: string,
): Promise<{ community: Community; membership: CommunityMember | null; agentId: string }> {
  assert(isCommunityAutoTaggerAgentSlug(moderatorSlug), 404, 'AI agent not found')

  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')
  const membership = await getCommunityMember(community.id, currentUser.id)
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
