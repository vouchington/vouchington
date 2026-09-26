import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { KpiCards } from '@/components/admin/growth/kpi-cards'
import { StoryFrame } from '@/storybook/story-frame'
import { growthMetrics, quietGrowthMetrics } from './growth-metrics'

const meta = {
  title: 'Admin/Kpi Cards',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Last30Days: Story = {
  render: () => (
    <StoryFrame width='max-w-6xl'>
      <KpiCards metrics={growthMetrics} />
    </StoryFrame>
  ),
}

export const QuietPeriod: Story = {
  render: () => (
    <StoryFrame width='max-w-6xl'>
      <KpiCards metrics={quietGrowthMetrics} />
    </StoryFrame>
  ),
}
