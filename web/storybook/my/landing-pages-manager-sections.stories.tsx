import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LandingPagesUsernameRequired } from '@/components/my/landing-pages-manager-sections'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Landing Pages Username Required',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ChooseUsername: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <LandingPagesUsernameRequired />
    </StoryFrame>
  ),
}
