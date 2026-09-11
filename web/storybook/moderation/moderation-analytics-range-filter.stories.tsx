import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ModerationAnalyticsRangeFilter } from '@/components/moderation/moderation-analytics-range-filter'

const meta = {
  title: 'Moderation/Moderation Analytics Range Filter',
  component: ModerationAnalyticsRangeFilter,
  args: {
    basePath: '/moderation-transparency',
    range: '30d',
  },
  decorators: [
    Story => (
      <main className='bg-background p-6 text-foreground'>
        <Story />
      </main>
    ),
  ],
  parameters: {
    nextjs: { navigation: { pathname: '/moderation-transparency' } },
  },
} satisfies Meta<typeof ModerationAnalyticsRangeFilter>

export default meta
type Story = StoryObj<typeof meta>

export const LastThirtyDays: Story = {}

export const Today: Story = { args: { range: 'today' } }
