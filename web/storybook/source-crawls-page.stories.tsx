import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SourceCrawlsPage } from '@/components/topics/manage-source/source-crawls-page'

const meta = {
  title: 'Sources/Crawl History',
  component: SourceCrawlsPage,
} satisfies Meta<typeof SourceCrawlsPage>

export default meta
type Story = StoryObj<typeof meta>

const topic = {
  id: '0198b454-45b0-7000-8000-000000000001',
  slug: 'example-source',
  topic_type: 'rss_feed' as const,
}

const terminalPageInfo = {
  has_next_page: false,
  start_cursor: null,
  end_cursor: null,
}

export const WithCrawls: Story = {
  args: {
    rssFeedId: '0198b454-45b0-7000-8000-000000000002',
    topic,
    data: {
      results: [
        {
          id: '0198b454-45b0-7000-8000-000000000003',
          response_code: 200,
          created_at: '2026-08-17T12:00:00.000Z',
        },
        {
          id: '0198b454-45b0-7000-8000-000000000004',
          response_code: 304,
          created_at: '2026-08-16T12:00:00.000Z',
        },
      ],
      page_info: terminalPageInfo,
    },
  },
}

export const Empty: Story = {
  args: {
    rssFeedId: '0198b454-45b0-7000-8000-000000000002',
    topic,
    data: { results: [], page_info: terminalPageInfo },
  },
}
