import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { WebSearchResultItem } from '@/components/web-search/web-search-result-item'
import { WebSearchListClient } from '@/components/web-search/web-search-list-client'
import { EntityStoryFrame } from './entity-story-frame'
import type {
  WebSearchResultItem as WebSearchResultItemType,
  WebSearchResponseBody,
} from '@/types/api-responses'

const meta = {
  title: 'Entities/WebSearch',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const contentItem: WebSearchResultItemType = {
  url: {
    __entity_type: 'url',
    id: 'url-1',
    url: 'https://example.com/best-travel-cards',
    pathname: '/best-travel-cards',
    search_params: {},
    canonical_url_id: null,
    hostname: {
      __entity_type: 'hostname',
      id: 'hostname-1',
      hostname: 'example.com',
      topic_id: null,
    },
  },
  snippet:
    'The ⟦MARK⟧travel⟦/MARK⟧ rewards card comparison for 2026. … Earn 3x points on ⟦MARK⟧travel⟦/MARK⟧ and dining.',
  match_type: 'content',
}

const urlItem: WebSearchResultItemType = {
  url: {
    __entity_type: 'url',
    id: 'url-2',
    url: 'https://points.example.com/travel-guide',
    pathname: '/travel-guide',
    search_params: {},
    canonical_url_id: null,
    hostname: {
      __entity_type: 'hostname',
      id: 'hostname-2',
      hostname: 'points.example.com',
      topic_id: null,
    },
  },
  snippet: null,
  match_type: 'url',
}

const PAGE_INFO = { has_next_page: false, end_cursor: null, start_cursor: null }

const emptyResponse: WebSearchResponseBody = {
  results: [],
  page_info: PAGE_INFO,
}

const resultsResponse: WebSearchResponseBody = {
  results: [contentItem, urlItem],
  page_info: PAGE_INFO,
}

export const ContentResult: Story = {
  render: () => (
    <EntityStoryFrame title='Web Search — content result'>
      <WebSearchResultItem result={contentItem} />
    </EntityStoryFrame>
  ),
}

export const UrlResult: Story = {
  render: () => (
    <EntityStoryFrame title='Web Search — URL result'>
      <WebSearchResultItem result={urlItem} />
    </EntityStoryFrame>
  ),
}

export const ResultsList: Story = {
  render: () => (
    <EntityStoryFrame title='Web Search — results list'>
      <WebSearchListClient
        initialData={resultsResponse}
        query='travel'
      />
    </EntityStoryFrame>
  ),
}

export const EmptyResults: Story = {
  render: () => (
    <EntityStoryFrame title='Web Search — empty'>
      <WebSearchListClient
        initialData={emptyResponse}
        query='travel'
      />
    </EntityStoryFrame>
  ),
}
