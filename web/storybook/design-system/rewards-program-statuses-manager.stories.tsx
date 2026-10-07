import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { RewardsProgramStatusesManager } from '@/components/my/rewards-program-statuses-manager'
import type { ListResponse } from '@/types/api-responses'
import type { RewardsProgramStatus } from '@/types/my'

const meta = {
  title: 'Design System/Settings/Rewards Program Statuses Manager',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const fixtureStatuses: RewardsProgramStatus[] = [
  {
    id: 'status-user-1',
    rewards_program_status_topic_id: 'stat-1',
    started_on: '2022-01-15',
    expires_on: null,
    rewards_program_status: {
      id: 'stat-1',
      name: 'Delta Medallion Gold',
      slug: 'delta-medallion-gold',
    },
  },
  {
    id: 'status-user-2',
    rewards_program_status_topic_id: 'stat-2',
    started_on: '2023-03-01',
    expires_on: '2024-02-28',
    rewards_program_status: {
      id: 'stat-2',
      name: 'Marriott Bonvoy Platinum',
      slug: 'marriott-bonvoy-platinum',
    },
  },
  {
    id: 'status-user-3',
    rewards_program_status_topic_id: 'stat-3',
    started_on: null,
    expires_on: null,
    rewards_program_status: {
      id: 'stat-3',
      name: 'Hilton Honors Diamond',
      slug: 'hilton-honors-diamond',
    },
  },
]

const initialPage: ListResponse<RewardsProgramStatus> = {
  results: fixtureStatuses,
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

export const EmptyState: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <RewardsProgramStatusesManager initialPage={{ ...initialPage, results: [] }} />
      </div>
    </main>
  ),
}

export const WithItems: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <RewardsProgramStatusesManager initialPage={initialPage} />
      </div>
    </main>
  ),
}
