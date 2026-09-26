import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import GrowthDashboard from '@/components/admin/growth/growth-dashboard'
import { StoryFrame } from '@/storybook/story-frame'
import { growthMetrics, quietGrowthMetrics } from './growth-metrics'

const meta = {
  title: 'Admin/Growth Dashboard',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Last30Days: Story = {
  render: () => (
    <StoryFrame width='max-w-6xl'>
      <GrowthDashboard metrics={growthMetrics} />
    </StoryFrame>
  ),
}

export const UnavailableInfrastructure: Story = {
  render: () => (
    <StoryFrame width='max-w-6xl'>
      <GrowthDashboard metrics={quietGrowthMetrics} />
    </StoryFrame>
  ),
}
