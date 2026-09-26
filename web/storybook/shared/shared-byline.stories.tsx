import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SharedByline } from '@/components/shared/shared-byline'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'
import { publicUsers } from '@/storybook/entities/fixtures/users'

const alex = publicUsers[0]!
const official = publicUsers[1]!

const meta = {
  title: 'Shared/Shared Byline',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Member: Story = {
  render: () => (
    <StoryFrame>
      <SharedByline
        sharedByUser={alex}
        sharedAt={now}
      />
    </StoryFrame>
  ),
}

export const OfficialAccount: Story = {
  render: () => (
    <StoryFrame>
      <SharedByline
        sharedByUser={official}
        sharedAt={now}
      />
    </StoryFrame>
  ),
}
