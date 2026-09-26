import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ImageButton } from '@/components/posts/post-detail-image-button'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Posts/Image Button',
  component: ImageButton,
} satisfies Meta

export default meta
type Story = StoryObj

export const LoungePhoto: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <ImageButton
        alt='Centurion lounge before a redeye to Tokyo'
        imageId='image-sapphire-lounge'
        placement={{ id: 'placement-sapphire-lounge', revision: 1 }}
        onClick={() => {}}
        priority={false}
      />
    </StoryFrame>
  ),
}
