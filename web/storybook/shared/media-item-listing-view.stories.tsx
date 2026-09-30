import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator } from '@ts-shared/ui-messages'
import { AboutVouchaAside } from '@/components/asides/about-voucha-aside'
import { MediaItemListingView } from '@/components/feed/media-item-listing-view'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { ListSearchError } from '@/components/shared/list-search-error'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import {
  createBreadcrumbSchema,
  createCollectionPageSchema,
  createItemListSchema,
} from '@/lib/seo/structured-data'
import { StoryFrame } from '@/storybook/story-frame'

const t = createTranslator('en', await loadJsonMessages('en'))

const meta = {
  title: 'Shared/MediaItemListingView',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function listingProps(
  title: string,
  description: string,
  path: '/news' | '/videos',
  routeKey: 'news' | 'videos',
) {
  const breadcrumbItems = [{ name: title, path }]
  return {
    aside: AboutVouchaAside,
    collectionSchema: createCollectionPageSchema({ title, description, path }),
    breadcrumbSchema: createBreadcrumbSchema(breadcrumbItems, t),
    itemListSchema: createItemListSchema(
      [{ name: 'Example item', url: 'https://feeds.example/story' }],
      title,
    ),
    breadcrumbItems,
    routeKey,
  }
}

export const News: Story = {
  render: () => (
    <StoryFrame width='max-w-5xl'>
      <MediaItemListingView
        {...listingProps(
          'News',
          'Latest news from across the web on the topics you follow.',
          '/news',
          'news',
        )}
        dataPw='localization-tmux-smoke-news-page'
        headerActions={<AddSourceButton kind='news' />}
        feed={<p>Latest news items</p>}
      />
    </StoryFrame>
  ),
}

export const VideosSearchError: Story = {
  render: () => (
    <StoryFrame width='max-w-5xl'>
      <MediaItemListingView
        {...listingProps(
          'Videos',
          'Latest videos from the channels you follow.',
          '/videos',
          'videos',
        )}
        headerActions={<AddSourceButton kind='video' />}
        feed={
          <ListSearchError
            t={t}
            message='Search failed'
          />
        }
      />
    </StoryFrame>
  ),
}
