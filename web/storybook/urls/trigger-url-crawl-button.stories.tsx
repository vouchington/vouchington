import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TriggerUrlCrawlButton } from '@/components/urls/trigger-url-crawl-button'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'URLs/Trigger URL Crawl Button',
  component: TriggerUrlCrawlButton,
} satisfies Meta<typeof TriggerUrlCrawlButton>

export default meta
type Story = StoryObj<typeof meta>

export const RssFeed: Story = {
  args: {
    id: '00000000-0000-7000-8000-000000000201',
    urlType: 'rss_feed',
    rssFeedId: '00000000-0000-7000-8000-000000000202',
  },
  render: args => (
    <StoryFrame>
      <TriggerUrlCrawlButton {...args} />
    </StoryFrame>
  ),
}
