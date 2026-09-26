import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import MessageModsButton from '@/components/communities/message-mods-button'
import { communities } from '@/storybook/entities/fixtures/communities'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Message Mods Button',
  component: MessageModsButton,
} satisfies Meta<typeof MessageModsButton>

export default meta
type Story = StoryObj<typeof meta>

export const CreditCards: Story = {
  args: { communitySlug: communities[0]!.slug },
  render: args => (
    <StoryFrame width='max-w-xs'>
      <MessageModsButton {...args} />
    </StoryFrame>
  ),
}
