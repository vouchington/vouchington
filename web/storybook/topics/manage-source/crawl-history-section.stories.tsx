import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CrawlHistorySection } from '@/components/topics/manage-source/crawl-history-section'
import { StoryFrame } from '@/storybook/story-frame'
import { now } from '@/storybook/entities/fixtures/shared'

const meta = {
  title: 'Topics/Crawl History',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const RecentCrawl: Story = {
  render: () => (
    <StoryFrame>
      <CrawlHistorySection
        crawls={[{ id: 'crawl-fintech-daily', response_code: 200, created_at: now }]}
        crawlsHref='/rss-feed/fintech-daily/crawls'
        crawlDetailHrefBase='/rss-feed/fintech-daily/crawls/'
        newsHref='/rss-feed/fintech-daily/latest'
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <CrawlHistorySection
        crawls={[]}
        crawlsHref='/rss-feed/fintech-daily/crawls'
        crawlDetailHrefBase='/rss-feed/fintech-daily/crawls/'
        newsHref='/rss-feed/fintech-daily/latest'
      />
    </StoryFrame>
  ),
}
