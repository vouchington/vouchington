import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PointValuationsManager } from '@/components/my/point-valuations-manager'
import type { PointValuation } from '@/types/my'

const meta = {
  title: 'Design System/Settings/Point Valuations Manager',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const fixtureValuations: PointValuation[] = [
  {
    id: 'pv-1',
    rewards_program_id: 'prog-1',
    value_per_point: { amount: 35_000, currency: 'usd', scale: 6 },
    note: 'Redeeming for business class flights',
    rewards_program: {
      id: 'prog-1',
      name: 'Chase Ultimate Rewards',
      slug: 'chase-ultimate-rewards',
    },
  },
  {
    id: 'pv-2',
    rewards_program_id: 'prog-2',
    value_per_point: { amount: 20_000, currency: 'usd', scale: 6 },
    note: null,
    rewards_program: {
      id: 'prog-2',
      name: 'Amex Membership Rewards',
      slug: 'amex-membership-rewards',
    },
  },
  {
    id: 'pv-3',
    rewards_program_id: 'prog-3',
    value_per_point: { amount: 12_000, currency: 'usd', scale: 6 },
    note: 'Cash back equivalent',
    rewards_program: {
      id: 'prog-3',
      name: 'Capital One Miles',
      slug: 'capital-one-miles',
    },
  },
]

export const EmptyState: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <PointValuationsManager
          initialData={{
            results: [],
            page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
          }}
        />
      </div>
    </main>
  ),
}

export const WithItems: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <PointValuationsManager
          initialData={{
            results: fixtureValuations,
            page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
          }}
        />
      </div>
    </main>
  ),
}
