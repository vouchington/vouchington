import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LinkPostMedia } from '@/components/posts/link-post-media'
import type { UrlEmbed } from '@/types/api-responses'
import { StoryFrame } from '@/storybook/story-frame'

const sapphireReserveUrl = 'https://www.chase.com/personal/credit-cards/sapphire-reserve'

const sapphireArticleEmbed: UrlEmbed = {
  rss_feed_item_id: null,
  source_url: sapphireReserveUrl,
  media_type: 'article',
  video_id: null,
  video_platform: null,
  player_url: null,
  player_width: null,
  player_height: null,
  enclosure_url: null,
  enclosure_type: null,
  duration_seconds: null,
  thumbnail_url: null,
  title: 'Chase Sapphire Reserve annual benefits',
  description: 'Lounge access, transfer partners, and the annual travel credit.',
  provider_name: 'Chase',
  markdown: null,
  show_id: null,
  show_title: null,
  show_topic_slug: null,
  show_topic_type: null,
  embed_metadata: null,
  meta_tags: null,
  embed_oembed_url: null,
  embed_oembed_resolved_at: null,
}

const sapphireSourceEmbed: UrlEmbed = {
  ...sapphireArticleEmbed,
  title: null,
  description: null,
  provider_name: null,
}

const meta = {
  title: 'Posts/Link Post Media',
  component: LinkPostMedia,
} satisfies Meta

export default meta
type Story = StoryObj

export const Article: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <LinkPostMedia
        embed={sapphireArticleEmbed}
        view='card'
      />
    </StoryFrame>
  ),
}

export const SourceLink: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <LinkPostMedia
        embed={sapphireSourceEmbed}
        view='detail'
      />
    </StoryFrame>
  ),
}
