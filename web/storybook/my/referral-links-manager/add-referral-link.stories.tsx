import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AddReferralLink } from '@/components/my/referral-links-manager/add-referral-link'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Add Referral Link',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const SearchPrograms: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <AddReferralLink onSelectProgram={() => {}} />
    </StoryFrame>
  ),
}
