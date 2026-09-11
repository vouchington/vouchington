import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityModeratorStatsPanel } from '@/components/communities/community-moderator-stats-panel'
import type { CommunityModeratorStatsResponseBody } from '@/types/api-responses'

const meta = {
  title: 'Entities/Communities/ModeratorStats',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const noStatsData: CommunityModeratorStatsResponseBody = {
  window: 30,
  stats: [],
  users: {},
}

const withStatsData: CommunityModeratorStatsResponseBody = {
  window: 30,
  stats: [
    {
      actor_id: 'user-mod-1',
      total: 12,
      counts: { remove: 5, approve: 4, ban: 2, resolve_report: 1 },
    },
    {
      actor_id: 'user-mod-2',
      total: 7,
      counts: { remove: 3, approve: 3, ban: 1 },
    },
    {
      actor_id: 'user-mod-3',
      total: 2,
      counts: { approve: 2 },
    },
  ],
  users: {
    'user-mod-1': {
      id: 'user-mod-1',
      username: 'alice_mod',
      profile_image_id: null,
    },
    'user-mod-2': {
      id: 'user-mod-2',
      username: 'bob_mod',
      profile_image_id: null,
    },
    'user-mod-3': {
      id: 'user-mod-3',
      username: 'carol_mod',
      profile_image_id: null,
    },
  },
}

export const Empty: Story = {
  render: () => (
    <CommunityModeratorStatsPanel
      communitySlug='test-community'
      initialData={noStatsData}
    />
  ),
}

export const WithStats: Story = {
  render: () => (
    <CommunityModeratorStatsPanel
      communitySlug='test-community'
      initialData={withStatsData}
    />
  ),
}

export const NinetyDayWindow: Story = {
  render: () => (
    <CommunityModeratorStatsPanel
      communitySlug='test-community'
      initialData={{ ...withStatsData, window: 90 }}
    />
  ),
}

const withOtherActionsData: CommunityModeratorStatsResponseBody = {
  window: 30,
  stats: [
    {
      actor_id: 'user-mod-1',
      total: 12,
      counts: { remove: 2, approve: 1, warn: 5, lock: 2, pin: 1 },
    },
    {
      actor_id: 'user-mod-2',
      total: 7,
      counts: { remove: 3, approve: 3, ban: 1 },
    },
  ],
  users: {
    'user-mod-1': {
      id: 'user-mod-1',
      username: 'alice_mod',
      profile_image_id: null,
    },
    'user-mod-2': {
      id: 'user-mod-2',
      username: 'bob_mod',
      profile_image_id: null,
    },
  },
}

export const WithOtherActions: Story = {
  render: () => (
    <CommunityModeratorStatsPanel
      communitySlug='test-community'
      initialData={withOtherActionsData}
    />
  ),
}
