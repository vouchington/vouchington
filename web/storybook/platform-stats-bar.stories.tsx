import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PlatformStatsBar } from '@/components/home/platform-stats-bar'
import type { PlatformStatsResponse } from '@/types/api-responses'

const meta = {
  title: 'Home/PlatformStatsBar',
  component: PlatformStatsBar,
  decorators: [
    Story => (
      <main className='min-h-screen bg-background p-6 text-foreground'>
        <div className='mx-auto max-w-4xl'>
          <Story />
        </div>
      </main>
    ),
  ],
} satisfies Meta<typeof PlatformStatsBar>

export default meta
type Story = StoryObj<typeof meta>

const sampleStats: PlatformStatsResponse = {
  topic_count: 467,
  // Keep the full response shape even though this component renders only four counts.
  rss_feed_count: 102,
  post_count: 214,
  review_count: 83,
  data_point_count: 1480,
  hostname_count: 36,
}

export const Default: Story = {
  args: {
    data: sampleStats,
  },
}

export const ThresholdFiltering: Story = {
  args: {
    data: {
      ...sampleStats,
      data_point_count: 4,
      hostname_count: 2,
      review_count: 0,
    },
  },
}

export const AllBelowThreshold: Story = {
  args: {
    data: {
      ...sampleStats,
      topic_count: 0,
      review_count: 0,
      data_point_count: 0,
      hostname_count: 0,
    },
  },
}

export const Empty: Story = {
  args: { data: null },
}
