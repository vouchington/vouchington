import { ModQueue } from '@/components/communities/mod-queue'
import { CommunityAgentPromptHistory } from '@/components/communities/community-agent-prompt-history'
import { CommunityAgentPromptsPanel } from '@/components/communities/community-agent-prompts-panel'
import { CommunityAiAgentsPanel } from '@/components/communities/community-ai-agents-panel'
import { CommunityAutomodActionForm } from '@/components/communities/community-automod-action-form'
import { CommunityAutomodFlagsPanel } from '@/components/communities/community-automod-flags-panel'
import { CommunityAutomodReviewPanel } from '@/components/communities/community-automod-review-panel'
import { CommunityBansPanel } from '@/components/communities/community-bans-panel'
import { CommunityRaidModePanel } from '@/components/communities/community-raid-mode-panel'
import { CommunityPostTypeSettingsForm } from '@/components/communities/community-post-type-settings-form'
import { CommunityModeratorStatsPanel } from '@/components/communities/community-moderator-stats-panel'
import { CommunityOnboardingChecklist } from '@/components/communities/community-onboarding-checklist'
import { CommunityModeratorVacationPanel } from '@/components/communities/community-moderator-vacation-panel'
import { ModmailInbox } from '@/components/communities/modmail-inbox'
import type { ModerationReportSortParam } from '@/lib/api/client/reports'
import { getTranslations } from '@/lib/i18n/get-translations'
import type { Community } from '@/types/api-responses'
import type { CommunityModerationPanelData } from './community-moderation-data'

type Translate = Awaited<ReturnType<typeof getTranslations>>

export function CommunityModerationPanels({
  community,
  currentUserId,
  isStaff,
  reportSort,
  activeTab,
  activeTabIsExplicit,
  panels,
  t,
}: {
  community: Community
  currentUserId: string
  isStaff: boolean
  reportSort: ModerationReportSortParam
  activeTab: 'reports' | 'posts' | 'escalated'
  activeTabIsExplicit: boolean
  panels: CommunityModerationPanelData
  t: Translate
}) {
  const {
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
  } = panels
  const hasRules = community.rules_markdown != null && community.rules_markdown.length > 0
  const automodConfigured = (agentPrompts?.community_agent_prompts.length ?? 0) > 0
  const panelError = (label: string) => (
    <p className='rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive'>
      {t('extracted.moderation.page.labelCouldNotBeLoadedPlease_4538b470', { label })}
    </p>
  )

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
            myVacation.should_suppress_community_digests_while_on_vacation
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
        panelError(t('extracted.moderation.page.aiAgents_3d9e4348'))
      )}
      {agentPrompts ? (
        <CommunityAgentPromptsPanel
          key={`${community.slug}:${JSON.stringify(agentPrompts)}`}
          pageInfo={agentPrompts.page_info}
          prompts={agentPrompts.community_agent_prompts}
          communitySlug={community.slug}
        />
      ) : (
        panelError(t('extracted.moderation.page.agentPrompts_b17006d4'))
      )}
      <CommunityAutomodActionForm
        key={`${community.slug}-${community.automod_action}`}
        community={community}
      />
      {agentPromptHistory ? (
        <CommunityAgentPromptHistory
          key={agentPromptHistory.entries[0]?.id ?? community.slug}
          initialEntries={agentPromptHistory.entries}
          initialNextCursor={agentPromptHistory.next_cursor}
          communitySlug={community.slug}
        />
      ) : (
        panelError(t('extracted.moderation.page.agentPromptHistory_2eaa44fa'))
      )}
      {automodActions ? (
        <CommunityAutomodReviewPanel
          actions={automodActions.automod_actions}
          communitySlug={community.slug}
          stats={automodActions.stats}
        />
      ) : (
        panelError(t('extracted.moderation.page.automodReview_207675c0'))
      )}
      {automodFlags ? (
        <CommunityAutomodFlagsPanel
          entries={automodFlags.entries}
          communitySlug={community.slug}
        />
      ) : (
        panelError(t('extracted.communities.communityAutomodFlagsPanel.automodFlags_b5fc56db'))
      )}
      {pendingPosts && pendingReports ? (
        <ModQueue
          data={pendingPosts}
          reportsData={pendingReports}
          communitySlug={community.slug}
          currentUserId={currentUserId}
          isStaff={isStaff}
          reportSort={reportSort}
          activeTab={activeTab}
          activeTabIsExplicit={activeTabIsExplicit}
        />
      ) : (
        panelError(t('extracted.moderation.page.moderationQueue_50d92231'))
      )}
      <CommunityPostTypeSettingsForm
        key={`${community.slug}-${community.should_allow_review_posts}-${community.should_allow_data_point_posts}`}
        community={community}
      />
      {restrictions ? (
        <CommunityRaidModePanel
          key={`${community.slug}-${restrictions.results.map(result => result.id).join('-')}`}
          community={community}
          initialData={restrictions}
        />
      ) : (
        panelError(t('extracted.moderation.page.raidMode_d21c8747'))
      )}
      {bans ? (
        <CommunityBansPanel
          community={community}
          initialData={bans}
        />
      ) : (
        panelError(t('extracted.moderation.page.bans_4d5469c7'))
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
