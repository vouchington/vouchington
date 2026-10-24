import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { EmbedPreviewCard } from '@/components/shared/embed-preview-card'
import type { EmbedPreview } from '@/lib/embeds/embed-preview'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Shared/Embed Preview Card',
  component: EmbedPreviewCard,
} satisfies Meta<typeof EmbedPreviewCard>

export default meta
type Story = StoryObj<typeof meta>

const article: EmbedPreview = {
  title: 'How to value transferable points in 2026',
  description: 'A walkthrough of cents-per-point valuations across the major bank programs.',
  provider: 'Points Weekly',
  thumbnailUrl: null,
  sourceUrl: 'https://pointsweekly.example/valuations-2026',
  playerUrl: null,
  platform: null,
  rawMetaTags: {},
}

const video: EmbedPreview = {
  ...article,
  title: 'Chase Sapphire lounge walkthrough',
  provider: 'YouTube',
  sourceUrl: 'https://www.youtube.com/watch?v=loungeTour1',
  playerUrl: 'https://www.youtube-nocookie.com/embed/loungeTour1',
  platform: 'youtube',
}

export const Compact: Story = {
  args: { preview: article },
  render: args => (
    <StoryFrame>
      <EmbedPreviewCard {...args} />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByText('How to value transferable points in 2026')).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Open source' })).toHaveAttribute(
      'href',
      'https://pointsweekly.example/valuations-2026',
    )
  },
}

export const Hero: Story = {
  args: { preview: article, layout: 'hero' },
  render: args => (
    <StoryFrame>
      <EmbedPreviewCard {...args} />
    </StoryFrame>
  ),
}

export const VideoPlayer: Story = {
  args: { preview: video, showPlayer: true },
  render: args => (
    <StoryFrame>
      <EmbedPreviewCard {...args} />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Open source' })).toBeVisible()
  },
}

export const VideoCardWithoutPlayer: Story = {
  args: { preview: video },
  render: args => (
    <StoryFrame>
      <EmbedPreviewCard {...args} />
    </StoryFrame>
  ),
}

export const NothingToShow: Story = {
  args: {
    preview: {
      ...article,
      title: null,
      description: null,
      provider: null,
      sourceUrl: 'http://insecure.example/page',
    },
  },
  render: args => (
    <StoryFrame>
      <p>Before</p>
      <EmbedPreviewCard {...args} />
      <p>After</p>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('link')).toBeNull()
  },
}
