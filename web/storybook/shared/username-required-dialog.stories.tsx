import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UsernameRequiredDialog } from '@/components/shared/username-required-dialog'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Shared/Username Required Dialog',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Posting: Story = {
  render: () => (
    <StoryFrame>
      <UsernameRequiredDialog
        open
        onUsernameSet={() => undefined}
        onClose={() => undefined}
      />
    </StoryFrame>
  ),
}

export const Following: Story = {
  render: () => (
    <StoryFrame>
      <UsernameRequiredDialog
        open
        title='Choose a username to follow Sapphire Reserve'
        description='Following a topic needs a public username so people can see who follows it.'
        submitLabel='Save username'
        onUsernameSet={() => undefined}
        onClose={() => undefined}
      />
    </StoryFrame>
  ),
}
