import * as Sentry from '@sentry/nextjs'
import {
  getCommunityAgentPromptHistory,
  getCommunityAgentPrompts,
  getCommunityAiAgents,
  getCommunityAutomodRecentActions,
  getCommunityBans,
  getCommunityModerationQueue,
  getCommunityModeratorStats,
  getCommunityPendingModerationReports,
  getCommunityPendingPosts,
  getCommunityRestrictions,
  getMyModeratorVacation,
} from '@/lib/api/server'
import { getModmailInboxServer } from '@/lib/api/server/modmail'
import type { ModerationReportSortParam } from '@/lib/api/client/reports'

export async function loadCommunityModerationPanels(
  slug: string,
  reportSort: ModerationReportSortParam,
) {
  const [
    aiAgentsResult,
    automodActionsResult,
    automodFlagsResult,
    pendingPostsResult,
    pendingReportsResult,
    agentPromptsResult,
    agentPromptHistoryResult,
    bansResult,
    restrictionsResult,
    moderatorStatsResult,
    myVacationResult,
    modmailInboxResult,
  ] = await Promise.allSettled([
    getCommunityAiAgents(slug),
    getCommunityAutomodRecentActions(slug, { searchParams: { window: '48h', limit: 10 } }),
    getCommunityModerationQueue(slug, { searchParams: { source: 'automod_flag', limit: 25 } }),
    getCommunityPendingPosts(slug),
    getCommunityPendingModerationReports(slug, { searchParams: { sort: reportSort } }),
    getCommunityAgentPrompts(slug),
    getCommunityAgentPromptHistory(slug),
    getCommunityBans(slug),
    getCommunityRestrictions(slug),
    getCommunityModeratorStats(slug),
    getMyModeratorVacation(slug),
    getModmailInboxServer(slug),
  ])

  const aiAgents = aiAgentsResult.status === 'fulfilled' ? aiAgentsResult.value : null
  const automodActions =
    automodActionsResult.status === 'fulfilled' ? automodActionsResult.value : null
  const automodFlags = automodFlagsResult.status === 'fulfilled' ? automodFlagsResult.value : null
  const pendingPosts = pendingPostsResult.status === 'fulfilled' ? pendingPostsResult.value : null
  const pendingReports =
    pendingReportsResult.status === 'fulfilled' ? pendingReportsResult.value : null
  const agentPrompts = agentPromptsResult.status === 'fulfilled' ? agentPromptsResult.value : null
  const agentPromptHistory =
    agentPromptHistoryResult.status === 'fulfilled' ? agentPromptHistoryResult.value : null
  const bans = bansResult.status === 'fulfilled' ? bansResult.value : null
  const restrictions = restrictionsResult.status === 'fulfilled' ? restrictionsResult.value : null
  const moderatorStats =
    moderatorStatsResult.status === 'fulfilled' ? moderatorStatsResult.value : null
  const myVacation = myVacationResult.status === 'fulfilled' ? myVacationResult.value : null
  const modmailInbox = modmailInboxResult.status === 'fulfilled' ? modmailInboxResult.value : null

  for (const [name, result] of Object.entries({
    aiAgents: aiAgentsResult,
    automodActions: automodActionsResult,
    automodFlags: automodFlagsResult,
    pendingPosts: pendingPostsResult,
    pendingReports: pendingReportsResult,
    agentPrompts: agentPromptsResult,
    agentPromptHistory: agentPromptHistoryResult,
    bans: bansResult,
    restrictions: restrictionsResult,
    moderatorStats: moderatorStatsResult,
    myVacation: myVacationResult,
    modmailInbox: modmailInboxResult,
  })) {
    if (result.status === 'rejected') {
      Sentry.captureException(result.reason, { tags: { panel: name } })
    }
  }

  return {
    aiAgents,
    automodActions,
    automodFlags,
    pendingPosts,
    pendingReports,
    agentPrompts,
    agentPromptHistory,
    bans,
    restrictions,
    moderatorStats,
    myVacation,
    modmailInbox,
  }
}

export type CommunityModerationPanelData = Awaited<ReturnType<typeof loadCommunityModerationPanels>>
