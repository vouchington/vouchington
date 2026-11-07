import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { createTranslator } from '@ts-shared/ui-messages'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { CrawlAuthoredText } from '@/components/urls/crawl-authored-text'
import { CrawlMetaTags } from '@/components/urls/crawl-meta-tags'
import { UrlAdminAside } from '@/components/urls/url-admin-aside'
import { UrlCrawlsPage } from '@/components/urls/url-crawls-page'
import { UrlListPage } from '@/components/urls/url-list-page'
import { DomainsSearchForm } from '@/components/domains/domains-search-form'
import { EntityStoryFrame, AsideStack, StoryCard } from './entity-story-frame'
import { urlsResponse } from './entity-fixtures'
import type { PublicUrl } from '@/types/api-responses'

const meta = {
  title: 'Entities/URLs',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const t = createTranslator('en', await loadJsonMessages('en'))

const publicUrl: PublicUrl = {
  __entity_type: 'url',
  id: urlsResponse.results[0]!.id,
  url: urlsResponse.results[0]!.url,
  pathname: urlsResponse.results[0]!.pathname,
  search_params: { utm_source: 'storybook' },
  canonical_url_id: null,
  hostname: {
    __entity_type: 'hostname',
    id: urlsResponse.results[0]!.hostname!.id,
    hostname: urlsResponse.results[0]!.hostname!.hostname,
    topic_id: null,
  },
}

export const ListPage: Story = {
  render: () => (
    <EntityStoryFrame
      title='URLs'
      aside={UrlAsides}
    >
      <UrlListPage
        data={urlsResponse}
        nextPageParams={{ limit: 20 }}
      />
    </EntityStoryFrame>
  ),
}

export const ListForm: Story = {
  render: () => (
    <EntityStoryFrame title='URL search'>
      <DomainsSearchForm defaultQuery='best-cards' />
    </EntityStoryFrame>
  ),
}

export const MainPageContent: Story = {
  render: () => (
    <EntityStoryFrame
      title='URL crawl detail'
      aside={UrlAsides}
    >
      <CrawlMetaTags
        t={t}
        lang='en'
        meta={{
          title: 'Best cards guide',
          description: 'A crawl fixture with Open Graph, robots, viewport, and theme metadata.',
          robots: 'index,follow',
          viewport: 'width=device-width, initial-scale=1',
          'theme-color': '#111827',
        }}
      />
      <UrlCrawlsPage
        urlId={publicUrl.id}
        url={publicUrl.url}
        data={{
          results: [
            {
              __entity_type: 'crawl',
              id: 'crawl-1',
              response_status_code: 200,
              completed_at: '2026-05-10T12:00:00.000Z',
              created_at: '2026-05-10T11:59:00.000Z',
            },
            {
              __entity_type: 'crawl',
              id: 'crawl-2',
              response_status_code: 304,
              completed_at: '2026-05-09T12:00:00.000Z',
              created_at: '2026-05-09T11:59:00.000Z',
            },
          ],
          page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
        }}
      />
    </EntityStoryFrame>
  ),
}

export const CrawlText: Story = {
  render: () => (
    <EntityStoryFrame title='Crawled page text'>
      <dl>
        <div>
          <dt className='text-sm font-medium text-muted-foreground'>Title</dt>
          <CrawlAuthoredText
            as='dd'
            className='mt-1 text-sm text-foreground'
            lang='ar'
            text='عنوان الصفحة'
          />
        </div>
      </dl>
      <CrawlAuthoredText
        as='pre'
        className='mt-4 whitespace-pre-wrap text-sm text-foreground'
        lang='en-US'
        text='Page markdown'
      />
      <CrawlAuthoredText
        as='pre'
        className='mt-4 whitespace-pre-wrap text-sm text-muted-foreground'
        lang={null}
        text='Markdown without a page language'
      />
    </EntityStoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const title = canvas.getByText('عنوان الصفحة')
    await expect(title).toHaveAttribute('lang', 'ar')
    await expect(title).toHaveAttribute('dir', 'rtl')

    const markdown = canvas.getByText('Page markdown')
    await expect(markdown).toHaveAttribute('lang', 'en')
    await expect(markdown).toHaveAttribute('dir', 'ltr')

    const unknown = canvas.getByText('Markdown without a page language')
    await expect(unknown.getAttribute('lang')).toBeNull()
    await expect(unknown).toHaveAttribute('dir', 'auto')
    await expect(canvas.getByText('Title')).not.toHaveAttribute('lang')
  },
}

export const Asides: Story = {
  render: () => (
    <EntityStoryFrame title='URL asides'>
      <UrlAsides />
    </EntityStoryFrame>
  ),
}

function UrlAsides() {
  return (
    <AsideStack>
      <UrlAdminAside
        t={t}
        url={publicUrl}
        canTriggerCrawl
        urlType='url'
        rssFeedId={null}
      />
      <StoryCard title='Canonical'>
        <p className='text-sm text-muted-foreground'>{publicUrl.url}</p>
      </StoryCard>
    </AsideStack>
  )
}
