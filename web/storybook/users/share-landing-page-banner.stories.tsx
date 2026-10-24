import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ShareLandingPageBanner } from '@/components/users/share-landing-page-banner'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Users/Share Landing Page Banner',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <ShareLandingPageBanner username={storyCurrentUser.username ?? 'cardholder'} />
    </StoryFrame>
  ),
}
