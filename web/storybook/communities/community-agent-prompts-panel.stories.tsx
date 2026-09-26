import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityAgentPromptsPanel } from '@/components/communities/community-agent-prompts-panel'
import type { CommunityAgentPrompt } from '@/lib/api/client/community-agent-prompts'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { communities } from '@/storybook/entities/fixtures/communities'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Agent Prompts Panel',
  component: CommunityAgentPromptsPanel,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof CommunityAgentPromptsPanel>

export default meta
type Story = StoryObj<typeof meta>

const prompt: CommunityAgentPrompt = {
  id: 'prompt-referral-filter',
  community_id: communities[0]!.id,
  created_by_id: publicUsers[0]!.id,
  agent_id: 'agent-community-mod',
  prompt:
    'Flag posts that push a credit card referral link without a personal review or application data point.',
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

function PromptPanelPreview({
  communitySlug,
  prompts: initialPrompts,
}: {
  communitySlug: string
  prompts: CommunityAgentPrompt[]
}) {
  const [prompts, setPrompts] = useState(initialPrompts)
  return (
    <StoryFrame>
      <CommunityAgentPromptsPanel
        communitySlug={communitySlug}
        prompts={prompts}
        onPromptUpdated={(updated, promptId) => {
          setPrompts(current =>
            updated == null
              ? current.filter(item => item.id !== promptId)
              : current.map(item => (item.id === updated.id ? updated : item)),
          )
        }}
      />
    </StoryFrame>
  )
}

export const WithPrompt: Story = {
  args: { communitySlug: communities[0]!.slug, prompts: [prompt] },
  render: args => <PromptPanelPreview {...args} />,
}

export const Empty: Story = {
  args: { communitySlug: communities[0]!.slug, prompts: [] },
  render: args => <PromptPanelPreview {...args} />,
}
