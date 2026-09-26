import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BlockHostnameQuickAdd } from '@/components/domains/block-hostname-quick-add'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Domains/Block Hostname Quick Add',
  component: BlockHostnameQuickAdd,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof BlockHostnameQuickAdd>

export default meta
type Story = StoryObj<typeof meta>

export const Admin: Story = {
  args: { isAdmin: true },
  render: args => (
    <StoryFrame>
      <BlockHostnameQuickAdd {...args} />
    </StoryFrame>
  ),
}

export const NotAdmin: Story = {
  args: { isAdmin: false },
  render: args => (
    <StoryFrame>
      <BlockHostnameQuickAdd {...args} />
    </StoryFrame>
  ),
}
