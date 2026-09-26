import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UrlEmbedRow } from '@/components/tags/url-embed-row'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Tags/URL Embed Row',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const WithPreview: Story = {
  render: () => (
    <StoryFrame>
      <UrlEmbedRow
        url='https://fintech.example/guides/transfer-partners'
        latestCrawl={{
          title: 'Guide to transfer partners',
          image_url: 'https://fintech.example/images/transfer-partners.png',
        }}
      />
    </StoryFrame>
  ),
}

export const LinkOnly: Story = {
  render: () => (
    <StoryFrame>
      <UrlEmbedRow url='https://www.chase.com/sapphire-reserve' />
    </StoryFrame>
  ),
}
