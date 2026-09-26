import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { VideoEmbed } from '@/components/feed/video-embed'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Feed/Video Embed',
  component: VideoEmbed,
} satisfies Meta<typeof VideoEmbed>

export default meta
type Story = StoryObj<typeof meta>

export const YouTube: Story = {
  args: {
    platform: 'youtube',
    playerUrl: 'https://www.youtube-nocookie.com/embed/loungeTour1',
    videoId: 'loungeTour1',
    title: 'Chase Sapphire lounge walkthrough',
  },
  render: args => (
    <StoryFrame>
      <VideoEmbed {...args} />
    </StoryFrame>
  ),
}

export const ExternalLink: Story = {
  args: {
    platform: 'youtube',
    playerUrl: null,
    title: 'Amex Centurion lounge tour',
    itemUrl: 'https://www.youtube.com/watch?v=loungeTour1',
  },
  render: args => (
    <StoryFrame>
      <VideoEmbed {...args} />
    </StoryFrame>
  ),
}
