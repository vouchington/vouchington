import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityAgentPromptItem } from '@/components/communities/community-agent-prompt-item'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import type { CommunityAgentPrompt } from '@/lib/api/client/community-agent-prompts'
import { communities } from '@/storybook/entities/fixtures/communities'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Agent Prompt Item',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const promptText =
  'Flag posts that push a credit card referral link without a personal review or application data point.'

const allocatedPrompt: CommunityAgentPrompt = {
  id: 'prompt-referral-filter',
  community_id: communities[0]!.id,
  created_by_id: publicUsers[0]!.id,
  agent_id: 'agent-community-mod',
  prompt: promptText,
  model_name: 'gpt-4.1-mini',
  model_provider: 'openai',
  slot_allocated: true,
  on_flag_action: 'unpublish',
  activated_at: '2026-04-02T15:00:00.000Z',
  deactivated_at: null,
  created_at: '2026-04-02T15:00:00.000Z',
  updated_at: '2026-05-01T12:00:00.000Z',
  deleted_at: null,
  deleted_by_id: null,
}

function PromptPreview({
  initialPrompt,
  communitySlug,
}: {
  initialPrompt: CommunityAgentPrompt
  communitySlug: string
}) {
  const [prompt, setPrompt] = useState<CommunityAgentPrompt | null>(initialPrompt)
  if (prompt === null) {
    return (
      <StoryFrame>
        <p>Prompt deleted</p>
      </StoryFrame>
    )
  }
  return (
    <StoryFrame>
      <CommunityAgentPromptItem
        communitySlug={communitySlug}
        prompt={prompt}
        onPromptUpdated={setPrompt}
      />
    </StoryFrame>
  )
}

export const Allocated: Story = {
  render: () => (
    <PromptPreview
      communitySlug={communities[0]!.slug}
      initialPrompt={allocatedPrompt}
    />
  ),
}

export const Unallocated: Story = {
  render: () => (
    <PromptPreview
      communitySlug={communities[0]!.slug}
      initialPrompt={{ ...allocatedPrompt, slot_allocated: false, activated_at: null }}
    />
  ),
}
