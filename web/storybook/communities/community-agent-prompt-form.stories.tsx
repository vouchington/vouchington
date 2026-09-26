import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityAgentPromptForm } from '@/components/communities/community-agent-prompt-form'
import { communities } from '@/storybook/entities/fixtures/communities'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Agent Prompt Form',
  component: CommunityAgentPromptForm,
} satisfies Meta<typeof CommunityAgentPromptForm>

export default meta
type Story = StoryObj<typeof meta>

export const NewPrompt: Story = {
  args: { communitySlug: communities[0]!.slug },
  render: args => (
    <StoryFrame>
      <CommunityAgentPromptForm {...args} />
    </StoryFrame>
  ),
}
