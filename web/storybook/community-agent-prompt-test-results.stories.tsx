import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityAgentPromptTestResults } from '@/components/communities/community-agent-prompt-test-results'
import type { CommunityAutomodSimulation } from '@/lib/api/client/community-agent-prompts'

const simulation = {
  simulation: {
    prompt_id: '019000000000000000000000101',
    time_window_hours: 168,
    sample_count: 240,
    would_flag_count: 3,
    would_unpublish_count: 1,
    false_positive_estimate: {
      historical_flagged_count: 12,
      historical_approved_count: 200,
      rate: 0.06,
    },
  },
  results: [
    {
      post_id: '019000000000000000000000201',
      title: 'Follow my referral link for a free bonus!',
      declared_language: 'en',
      lingua_rs_detected_language: 'en',
      post_type: 'discussion',
      approved_at: '2026-06-01T10:00:00.000Z',
      content_excerpt: 'Hey everyone, use my link below to get a free sign-up bonus...',
      flagged: true,
      reason: 'Repeated unrelated referral link promotion.',
      would_unpublish: true,
    },
    {
      post_id: '019000000000000000000000202',
      title: 'Check out this card comparison',
      declared_language: null,
      lingua_rs_detected_language: 'en',
      post_type: 'discussion',
      approved_at: '2026-06-02T10:00:00.000Z',
      content_excerpt: 'Not affiliated with any bank, just sharing a comparison I made...',
      flagged: true,
      reason: 'Borderline promotional language.',
      would_unpublish: false,
    },
  ],
} satisfies CommunityAutomodSimulation

const meta = {
  title: 'Communities/Community Agent Prompt Test Results',
  component: CommunityAgentPromptTestResults,
} satisfies Meta<typeof CommunityAgentPromptTestResults>

export default meta
type Story = StoryObj<typeof meta>

export const WithFlaggedResults: Story = {
  args: {
    simulation,
    flaggedResults: simulation.results,
    uiLocale: 'en-US',
  },
}

export const NoFlaggedResults: Story = {
  args: {
    simulation: { ...simulation, results: [] },
    flaggedResults: [],
    uiLocale: 'en-US',
  },
}
