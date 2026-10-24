import { Suspense } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PlatformStatsBarStreaming } from '@/components/home/platform-stats-bar-streaming'
import type { PlatformStatsViewModel } from '@/lib/view-models/homepage-view-models'
import { StoryFrame } from '@/storybook/story-frame'

const meta = { title: 'Home/Platform Stats Streaming' } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

const stats: PlatformStatsViewModel = {
  data_point_count: 1480,
  topic_count: 467,
  review_count: 83,
  hostname_count: 36,
}
const statsPromise = Promise.resolve(stats)

export const WithStats: Story = {
  render: () => (
    <StoryFrame>
      <Suspense fallback={<p>Loading stats</p>}>
        <PlatformStatsBarStreaming dataPromise={statsPromise} />
      </Suspense>
    </StoryFrame>
  ),
}
