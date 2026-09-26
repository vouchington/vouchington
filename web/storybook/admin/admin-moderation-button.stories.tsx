import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { userEvent, within } from 'storybook/test'
import AdminModerationButton from '@/components/admin/admin-moderation-button'
import { StoryFrame } from '@/storybook/story-frame'
import type { AgentModeration, AgentModerationElection } from '@/types/agents'

const flaggedReview: AgentModeration = {
  id: 'moderation-sapphire-review',
  post_id: 'post-review',
  prompt_id: 'prompt-spam',
  agent_id: 'agent-moderation',
  moderator_slug: 'spam-detector',
  flagged: true,
  results: {
    flagged: true,
    reason:
      'The Sapphire Reserve review repeats a referral code and never mentions the annual fee or restaurant category.',
    confidence_score: 0.91,
    confidence_threshold: 0.8,
    detector: 'voucha-spam',
  },
  input_sha256: 'sapphire-review-sha',
  created_at: '2026-09-25T15:00:00.000Z',
  updated_at: '2026-09-25T15:00:00.000Z',
}

const election: AgentModerationElection = {
  __entity_type: 'agent_moderation_election',
  id: 'election-moderation-sapphire-review',
  votes_score_net: 2,
  votes_count_up: 3,
  votes_count_down: 1,
}

const meta = {
  title: 'Admin/Admin Moderation Button',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const FlaggedReview: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <AdminModerationButton
        moderations={[flaggedReview]}
        elections={{ [flaggedReview.id]: election }}
      />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Flagged' }))
  },
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <AdminModerationButton moderations={[]} />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Moderation' }))
  },
}
