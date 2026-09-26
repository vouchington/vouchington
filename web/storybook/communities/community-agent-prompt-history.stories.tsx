import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityAgentPromptHistory } from '@/components/communities/community-agent-prompt-history'
import type { CommunityAgentPromptHistoryEntry } from '@/lib/api/client/community-agent-prompts'
import { communities } from '@/storybook/entities/fixtures/communities'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Agent Prompt History',
  component: CommunityAgentPromptHistory,
} satisfies Meta<typeof CommunityAgentPromptHistory>

export default meta
type Story = StoryObj<typeof meta>

const updatedEntry: CommunityAgentPromptHistoryEntry = {
  id: 'prompt-history-1',
  agent_prompt_id: 'prompt-referral-filter',
  community_id: communities[0]!.id,
  action: 'updated',
  changed_by: { id: publicUsers[0]!.id, username: publicUsers[0]!.username ?? null },
  previous_fields: {},
  next_fields: {},
  changed_fields: {
    prompt: {
      previous: 'Flag bare referral links.',
      next: 'Flag credit card referral links that do not include a personal data point.',
    },
  },
  created_at: '2026-05-12T16:40:00.000Z',
}

export const WithChanges: Story = {
  args: {
    communitySlug: communities[0]!.slug,
    initialEntries: [updatedEntry],
    initialNextCursor: null,
  },
  render: args => (
    <StoryFrame>
      <CommunityAgentPromptHistory {...args} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  args: {
    communitySlug: communities[0]!.slug,
    initialEntries: [],
    initialNextCursor: null,
  },
  render: args => (
    <StoryFrame>
      <CommunityAgentPromptHistory {...args} />
    </StoryFrame>
  ),
}
