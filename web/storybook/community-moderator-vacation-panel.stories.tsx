import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityModeratorVacationPanel } from '@/components/communities/community-moderator-vacation-panel'
import type { CommunityMemberVacation } from '@/types/api-responses'

const activeVacation: CommunityMemberVacation = {
  community_id: '019000000000000000000000001',
  user_id: '019000000000000000000000021',
  starts_at: '2026-06-01T00:00:00.000Z',
  ends_at: null,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
}

const vacationWithEndDate: CommunityMemberVacation = {
  community_id: '019000000000000000000000001',
  user_id: '019000000000000000000000021',
  starts_at: '2026-06-01T00:00:00.000Z',
  ends_at: '2026-06-15T00:00:00.000Z',
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
}

const meta = {
  title: 'Communities/Community Moderator Vacation Panel',
  component: CommunityModeratorVacationPanel,
  parameters: { auth: { currentUser: null } },
  args: {
    communitySlug: 'test-community',
    initialSuppressCommunityDigestsWhileOnVacation: false,
  },
} satisfies Meta<typeof CommunityModeratorVacationPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    initialVacation: null,
  },
}

export const OnVacation: Story = {
  args: {
    initialVacation: activeVacation,
  },
}

export const OnVacationWithEndDate: Story = {
  args: {
    initialVacation: vacationWithEndDate,
  },
}
