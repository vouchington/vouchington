/* oxlint-disable max-lines -- moderation page aggregates ~10 independent panels each with its own data fetch; Promise.allSettled resilience pattern adds necessary boilerplate */
export const dynamic = 'force-dynamic'

import * as Sentry from '@sentry/nextjs'
import { notFound, redirect } from 'next/navigation'
import {
  getCommunity,
  getCommunityAgentPromptHistory,
  getCommunityAgentPrompts,
  getCommunityAiAgents,
  getCommunityAutomodRecentActions,
  getCommunityBans,
  getCommunityModeratorStats,
  getCommunityRestrictions,
  getCommunityPendingModerationReports,
  getCommunityPendingPosts,
  getMyModeratorVacation,
} from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getModmailInboxServer } from '@/lib/api/server/modmail'
import { isAdmin, isModerationStaff } from '@/lib/auth/official-account'
import { ModQueue } from '@/components/communities/mod-queue'
import { CommunityAgentPromptHistory } from '@/components/communities/community-agent-prompt-history'
import { CommunityAgentPromptsPanel } from '@/components/communities/community-agent-prompts-panel'
import { CommunityAiAgentsPanel } from '@/components/communities/community-ai-agents-panel'
import { CommunityAutomodReviewPanel } from '@/components/communities/community-automod-review-panel'
import { CommunityBansPanel } from '@/components/communities/community-bans-panel'
import { CommunityRaidModePanel } from '@/components/communities/community-raid-mode-panel'
import { CommunityPostTypeSettingsForm } from '@/components/communities/community-post-type-settings-form'
import { CommunityModeratorStatsPanel } from '@/components/communities/community-moderator-stats-panel'
import { CommunityOnboardingChecklist } from '@/components/communities/community-onboarding-checklist'
import { CommunityModeratorVacationPanel } from '@/components/communities/community-moderator-vacation-panel'
import { ModmailInbox } from '@/components/communities/modmail-inbox'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import { getTranslations } from '@/lib/i18n/get-translations'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ reportSort?: string; tab?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getCommunity(slug)
  if (!data) return {}
  return createNoIndexMetadata(`Moderation — ${data.community.name}`)
}

async function PanelError({ label }: { label: string }) {
  const t = await getTranslations()
  return (
    <p className='rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive'>
      {t('extracted.moderation.page.labelCouldNotBeLoadedPlease_4538b470', { label })}
    </p>
  )
}

export default async function CommunityModerationPage({ params, searchParams }: PageProps) {
  const t = await getTranslations()
  const { slug } = await params
  const { reportSort: rawReportSort, tab: rawTab } = (await searchParams) ?? {}
  const requestedReportSort = parseCommunityReportSort(rawReportSort)
  const activeTab = parseModQueueTab(rawTab)
  const activeTabIsExplicit = isModQueueTab(rawTab)
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/login')
  }

  const communityData = await getCommunity(slug)

  if (!communityData) {
    notFound()
  }

  const { community, membership } = communityData
  const role = membership?.removed_at == null ? membership?.role : null

  if (!isAdmin(currentUser) && role !== 'owner' && role !== 'moderator') {
    notFound()
  }

  const isStaff = isModerationStaff(currentUser)
  const reportSort =
    !isStaff && requestedReportSort === 'severity' ? 'created_at_desc' : requestedReportSort

  const [
    aiAgentsResult,
    automodActionsResult,
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

  const hasRules = community.rules_markdown != null && community.rules_markdown.length > 0
  const automodConfigured = (agentPrompts?.community_agent_prompts.length ?? 0) > 0

  return (
    <div className='space-y-6'>
      <CommunityOnboardingChecklist
        key={community.slug}
        communitySlug={community.slug}
        hasRules={hasRules}
        automodConfigured={automodConfigured}
      />
      {myVacation !== null && myVacation !== undefined && (
        <CommunityModeratorVacationPanel
          communitySlug={community.slug}
          initialVacation={myVacation.vacation}
          initialSuppressCommunityDigestsWhileOnVacation={
            myVacation.suppress_community_digests_while_on_vacation
          }
        />
      )}
      <div>
        <h2
          className='text-2xl font-bold'
          data-pw='community-moderation-heading'
        >
          {t('extracted.moderation.page.moderationQueue_f04c9f4d')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.moderation.page.reviewPendingPostsAndCommunityScoped_e24e1836')}
        </p>
      </div>
      {aiAgents ? (
        <CommunityAiAgentsPanel
          agents={aiAgents.community_ai_agents}
          communitySlug={community.slug}
        />
      ) : (
        <PanelError label={t('extracted.moderation.page.aiAgents_3d9e4348')} />
      )}
      {agentPrompts ? (
        <CommunityAgentPromptsPanel
          key={community.slug}
          prompts={agentPrompts.community_agent_prompts}
          communitySlug={community.slug}
        />
      ) : (
        <PanelError label={t('extracted.moderation.page.agentPrompts_b17006d4')} />
      )}
      {agentPromptHistory ? (
        <CommunityAgentPromptHistory
          key={agentPromptHistory.entries[0]?.id ?? community.slug}
          initialEntries={agentPromptHistory.entries}
          initialNextCursor={agentPromptHistory.next_cursor}
          communitySlug={community.slug}
        />
      ) : (
        <PanelError label={t('extracted.moderation.page.agentPromptHistory_2eaa44fa')} />
      )}
      {automodActions ? (
        <CommunityAutomodReviewPanel
          actions={automodActions.automod_actions}
          communitySlug={community.slug}
          stats={automodActions.stats}
        />
      ) : (
        <PanelError label={t('extracted.moderation.page.automodReview_207675c0')} />
      )}
      {pendingPosts && pendingReports ? (
        <ModQueue
          data={pendingPosts}
          reportsData={pendingReports}
          communitySlug={community.slug}
          currentUserId={currentUser.id}
          isStaff={isStaff}
          reportSort={reportSort}
          activeTab={activeTab}
          activeTabIsExplicit={activeTabIsExplicit}
        />
      ) : (
        <PanelError label={t('extracted.moderation.page.moderationQueue_50d92231')} />
      )}
      <CommunityPostTypeSettingsForm
        key={`${community.slug}-${community.allow_review_posts}-${community.allow_data_point_posts}`}
        community={community}
      />
      {restrictions ? (
        <CommunityRaidModePanel
          key={`${community.slug}-${restrictions.results.map(result => result.id).join('-')}`}
          community={community}
          initialData={restrictions}
        />
      ) : (
        <PanelError label={t('extracted.moderation.page.raidMode_d21c8747')} />
      )}
      {bans ? (
        <CommunityBansPanel
          community={community}
          initialData={bans}
        />
      ) : (
        <PanelError label={t('extracted.moderation.page.bans_4d5469c7')} />
      )}
      <ModmailInbox
        key={community.slug}
        communitySlug={community.slug}
        initialData={modmailInbox}
      />
      {moderatorStats && (
        <CommunityModeratorStatsPanel
          key={community.slug}
          communitySlug={community.slug}
          initialData={moderatorStats}
        />
      )}
    </div>
  )
}

function parseCommunityReportSort(value: string | undefined) {
  if (
    value === 'severity' ||
    value === 'most_reported' ||
    value === 'created_at_asc' ||
    value === 'created_at_desc'
  ) {
    return value
  }
  return 'severity'
}

function isModQueueTab(value: string | undefined): value is 'reports' | 'posts' | 'escalated' {
  return value === 'reports' || value === 'posts' || value === 'escalated'
}

function parseModQueueTab(value: string | undefined): 'reports' | 'posts' | 'escalated' {
  return isModQueueTab(value) ? value : 'reports'
}
