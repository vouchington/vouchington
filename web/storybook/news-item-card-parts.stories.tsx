import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { NewsItemCardHeader } from '@/components/feed/news-item-card-header'
import { NewsItemCardMedia } from '@/components/feed/news-item-card-media'
import { newsItems } from './entities/entity-fixtures'

const item = newsItems[0]!

const meta = {
  title: 'Entities/News Item Card Parts',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Header: Story = {
  render: () => (
    <NewsItemCardHeader
      item={item}
      isAuthenticated={false}
      outboundUrl={item.url.url}
      authoredTitle={item.data.title ?? null}
    />
  ),
}

export const Media: Story = {
  render: () => (
    <NewsItemCardMedia
      item={item}
      view='summary'
      audio={{
        enclosureUrl: null,
        enclosureType: undefined,
        durationSeconds: undefined,
        mediaType: 'article',
      }}
      previewTitle={item.data.title ?? null}
      excerpt={item.data.contentSnippet ?? null}
      fallbackExcerpt={null}
      videoPlatform={null}
      renderedThumbnailUrl={null}
      modalHref={`/news?rss_item=${item.id}`}
      contentLanguage={undefined}
      outboundUrl={item.url.url}
    />
  ),
}
