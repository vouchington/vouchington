import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ModlogFilters } from '@/components/admin/modlog-filters'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Admin/Modlog Filters',
  component: ModlogFilters,
} satisfies Meta<typeof ModlogFilters>

export default meta
type Story = StoryObj<typeof meta>

export const AllActions: Story = {
  args: {},
  render: args => (
    <StoryFrame width='max-w-2xl'>
      <ModlogFilters {...args} />
    </StoryFrame>
  ),
}

export const SelectedFilters: Story = {
  args: { community: 'harbour', actor: 'moderator' },
  render: args => (
    <StoryFrame width='max-w-2xl'>
      <ModlogFilters {...args} />
    </StoryFrame>
  ),
}
