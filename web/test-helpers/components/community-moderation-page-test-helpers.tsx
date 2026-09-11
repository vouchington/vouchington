import { vi } from 'vitest'
type HeaderBag = { get: (key: string) => string | null }
const {
  mockGetCurrentUser,
  mockIsAdmin,
  mockIsModerationStaff,
  mockCommunityAutomodReviewPanel,
  mockGetCommunity,
  mockGetCommunityAiAgents,
  mockGetCommunityAgentPrompts,
  mockGetCommunityAgentPromptHistory,
  mockGetCommunityAutomodRecentActions,
  mockGetCommunityBans,
  mockGetCommunityRestrictions,
  mockGetCommunityModeratorStats,
  mockGetCommunityPendingModerationReports,
  mockGetCommunityPendingPosts,
  mockGetMyModeratorVacation,
  mockNotFound,
  mockRedirect,
  mockHeaders,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockIsAdmin: vi.fn<VitestLooseMock>(),
  mockIsModerationStaff: vi.fn<VitestLooseMock>(),
  mockCommunityAutomodReviewPanel: vi.fn<VitestLooseMock>(() => <div>automod-review-panel</div>),
  mockGetCommunity: vi.fn<VitestLooseMock>(),
  mockGetCommunityAiAgents: vi.fn<VitestLooseMock>(),
  mockGetCommunityAgentPrompts: vi.fn<VitestLooseMock>(),
  mockGetCommunityAgentPromptHistory: vi.fn<VitestLooseMock>(),
  mockGetCommunityAutomodRecentActions: vi.fn<VitestLooseMock>(),
  mockGetCommunityBans: vi.fn<VitestLooseMock>(),
  mockGetCommunityRestrictions: vi.fn<VitestLooseMock>(),
  mockGetCommunityModeratorStats: vi.fn<VitestLooseMock>(),
  mockGetCommunityPendingModerationReports: vi.fn<VitestLooseMock>(),
  mockGetCommunityPendingPosts: vi.fn<VitestLooseMock>(),
  mockGetMyModeratorVacation: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NOT_FOUND')
  }),
  mockRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('REDIRECT')
  }),
  mockHeaders: vi.fn<() => Promise<HeaderBag>>(),
}))
export { mockGetCurrentUser, mockIsAdmin, mockIsModerationStaff }
export { mockCommunityAutomodReviewPanel, mockGetCommunity }
export { mockGetCommunityAiAgents, mockGetCommunityAgentPrompts }
export { mockGetCommunityAgentPromptHistory, mockGetCommunityAutomodRecentActions }
export { mockGetCommunityBans, mockGetCommunityRestrictions, mockGetCommunityModeratorStats }
export { mockGetCommunityPendingModerationReports }
export { mockGetCommunityPendingPosts, mockGetMyModeratorVacation }
export { mockNotFound, mockRedirect, mockHeaders }
vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))
vi.mock(
  import('next/headers'),
  () => ({ headers: mockHeaders }) as unknown as typeof import('next/headers'),
)
vi.mock(import('@/lib/auth/official-account'), () => ({
  isAdmin: mockIsAdmin,
  isModerationStaff: mockIsModerationStaff,
}))
vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: mockGetCommunity,
  getCommunityAiAgents: mockGetCommunityAiAgents,
  getCommunityAgentPrompts: mockGetCommunityAgentPrompts,
  getCommunityAgentPromptHistory: mockGetCommunityAgentPromptHistory,
  getCommunityAutomodRecentActions: mockGetCommunityAutomodRecentActions,
  getCommunityBans: mockGetCommunityBans,
  getCommunityRestrictions: mockGetCommunityRestrictions,
  getCommunityModeratorStats: mockGetCommunityModeratorStats,
  getCommunityPendingModerationReports: mockGetCommunityPendingModerationReports,
  getCommunityPendingPosts: mockGetCommunityPendingPosts,
  getMyModeratorVacation: mockGetMyModeratorVacation,
}))
vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('@/lib/seo/metadata'),
  () =>
    ({
      createNoIndexMetadata: (t: string) => ({ title: t }),
    }) as unknown as typeof import('@/lib/seo/metadata'),
)
vi.mock(
  import('@/components/communities/mod-queue'),
  () =>
    ({
      ModQueue: ({
        reportSort,
        activeTab,
        activeTabIsExplicit,
      }: Record<string, string | boolean>) => (
        <div data-pw='mod-queue'>
          <span>mod-queue</span>
          <span>sort:{reportSort}</span>
          <span>{`tab:${activeTab};explicit:${String(activeTabIsExplicit)}`}</span>
        </div>
      ),
    }) as unknown as typeof import('@/components/communities/mod-queue'),
)
vi.mock(import('@/components/communities/community-ai-agents-panel'), () => ({
  CommunityAiAgentsPanel: () => <div>ai-agents-panel</div>,
}))
vi.mock(import('@/components/communities/community-agent-prompts-panel'), () => ({
  CommunityAgentPromptsPanel: () => <div>agent-prompts-panel</div>,
}))
vi.mock(import('@/components/communities/community-agent-prompt-history'), () => ({
  CommunityAgentPromptHistory: () => <div>agent-prompt-history</div>,
}))
vi.mock(import('@/components/communities/community-automod-review-panel'), () => ({
  CommunityAutomodReviewPanel: mockCommunityAutomodReviewPanel,
}))
vi.mock(import('@/components/communities/community-bans-panel'), () => ({
  CommunityBansPanel: () => <div>bans-panel</div>,
}))
vi.mock(import('@/components/communities/community-raid-mode-panel'), () => ({
  CommunityRaidModePanel: () => <div>raid-mode-panel</div>,
}))
vi.mock(import('@/components/communities/community-post-type-settings-form'), () => ({
  CommunityPostTypeSettingsForm: () => <div>post-type-settings</div>,
}))
vi.mock(import('@/components/communities/community-moderator-stats-panel'), () => ({
  CommunityModeratorStatsPanel: () => <div>moderator-stats-panel</div>,
}))
vi.mock(import('@/components/communities/community-onboarding-checklist'), () => ({
  CommunityOnboardingChecklist: () => <div>onboarding-checklist</div>,
}))
vi.mock(import('@/components/communities/community-moderator-vacation-panel'), () => ({
  CommunityModeratorVacationPanel: () => <div>moderator-vacation-panel</div>,
}))

export const makeUser = (id = 'user-1') => ({ id, role: 'user' })

export function makeCommunityData(
  role: string | null = 'moderator',
  removedAt: string | null = null,
) {
  return {
    community: {
      id: 'c1',
      slug: 'test-community',
      name: 'Test Community',
      allow_review_posts: false,
      allow_data_point_posts: false,
    },
    membership: role ? { role, removed_at: removedAt } : null,
  }
}

export const defaultPendingPosts = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: {},
  posts_metrics: {},
}
export const defaultAutomodActions = {
  automod_actions: [],
  stats: { total_count: 0, false_positive_count: 0, false_positive_rate: 0 },
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}
export const defaultModeratorStats = { window: 30, stats: [], users: {} }
export const defaultRestrictions = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  community_restrictions: {},
  raid_mode_suggestion: { velocity_spike: false, flag_count: 0, latest_flagged_at: null },
}

export function resetModerationPageMocks() {
  vi.resetAllMocks()
  mockNotFound.mockImplementation(() => {
    throw new Error('NOT_FOUND')
  })
  mockRedirect.mockImplementation(() => {
    throw new Error('REDIRECT')
  })
  mockGetCommunityAiAgents.mockResolvedValue({ community_ai_agents: [] })
  mockGetCommunityPendingPosts.mockResolvedValue(defaultPendingPosts)
  mockGetCommunityPendingModerationReports.mockResolvedValue({ reports: [] })
  mockGetCommunityAgentPrompts.mockResolvedValue({ community_agent_prompts: [] })
  mockGetCommunityAgentPromptHistory.mockResolvedValue({ entries: [], next_cursor: null })
  mockGetCommunityAutomodRecentActions.mockResolvedValue(defaultAutomodActions)
  mockGetCommunityBans.mockResolvedValue({ bans: [] })
  mockGetCommunityModeratorStats.mockResolvedValue(defaultModeratorStats)
  mockGetCommunityRestrictions.mockResolvedValue(defaultRestrictions)
  mockGetMyModeratorVacation.mockResolvedValue(null)
  mockHeaders.mockResolvedValue({ get: () => null })
}
