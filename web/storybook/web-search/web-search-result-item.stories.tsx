import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { WebSearchResultItem } from '@/components/web-search/web-search-result-item'

const mockUrl = {
  __entity_type: 'url' as const,
  id: 'url-1',
  url: 'https://example.com/article-about-travel',
  pathname: '/article-about-travel',
  search_params: {},
  canonical_url_id: null,
  hostname: {
    __entity_type: 'hostname' as const,
    id: 'h1',
    hostname: 'example.com',
    topic_id: null,
  },
}

const meta = {
  title: 'WebSearch/WebSearchResultItem',
  component: WebSearchResultItem,
} satisfies Meta<typeof WebSearchResultItem>

export default meta
type Story = StoryObj<typeof meta>

export const ContentMatch: Story = {
  args: {
    result: {
      url: mockUrl,
      snippet: 'An article about ⟦MARK⟧travel⟦/MARK⟧ destinations in Europe.',
      match_type: 'content',
    },
  },
}

export const UrlMatch: Story = {
  args: {
    result: {
      url: mockUrl,
      snippet: null,
      match_type: 'url',
    },
  },
}
