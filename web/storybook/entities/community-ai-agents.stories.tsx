import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityAiAgentsPanel } from '@/components/communities/community-ai-agents-panel'
import type { CommunityAiAgent } from '@/types/api-responses'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Communities/AIAgents',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const baseAgent: CommunityAiAgent = {
  slug: 'self-promotion',
  agent_id: 'agent-self-promotion',
  system_user_id: 'system-self-promotion',
  system_username: 'self-promotion',
  label_topic_slugs: ['self-promotion'],
  on_flag_action: 'review_queue',
  enabled: false,
  always_on: false,
  enabled_at: null,
  enabled_by_id: null,
  entitlement: { allowed: true, reason: null },
}

const agents: CommunityAiAgent[] = [
  baseAgent,
  {
    ...baseAgent,
    slug: 'marketplace',
    agent_id: 'agent-marketplace',
    system_user_id: 'system-marketplace',
    system_username: 'marketplace',
    label_topic_slugs: ['buying', 'selling', 'trade', 'for-hire', 'hiring'],
  },
  {
    ...baseAgent,
    slug: 'ai-generated',
    agent_id: 'agent-ai-generated',
    system_user_id: 'system-ai-generated',
    system_username: 'ai-generated',
    label_topic_slugs: ['ai-generated'],
    enabled: true,
    always_on: true,
    enabled_at: '2026-06-01T12:00:00.000Z',
    entitlement: {
      allowed: false,
      reason: 'Baseline moderators can only be changed by platform administrators.',
    },
  },
  {
    ...baseAgent,
    slug: 'click-bait',
    agent_id: 'agent-click-bait',
    system_user_id: 'system-click-bait',
    system_username: 'click-bait',
    label_topic_slugs: ['click-bait'],
    on_flag_action: 'none',
  },
]

export const Toggles: Story = {
  render: () => (
    <EntityStoryFrame
      title='Community AI Agents'
      description='Global label agents toggled per community.'
    >
      <CommunityAiAgentsPanel
        agents={agents}
        communitySlug='credit-cards'
      />
    </EntityStoryFrame>
  ),
}

export const EntitlementBlocked: Story = {
  render: () => (
    <EntityStoryFrame
      title='Community AI Agents — Entitlement blocked'
      description='Future paywall and authorization state.'
    >
      <CommunityAiAgentsPanel
        agents={agents.map(agent => ({
          ...agent,
          enabled: false,
          enabled_at: null,
          entitlement: {
            allowed: false,
            reason: 'Community AI agents are not available for this community.',
          },
        }))}
        communitySlug='credit-cards'
      />
    </EntityStoryFrame>
  ),
}
