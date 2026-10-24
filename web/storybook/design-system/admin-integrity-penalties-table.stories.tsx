import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { IntegrityPenaltiesTable } from '@/components/admin/integrity-penalties-table'
import type {
  IntegrityPenaltiesState,
  IntegrityPenaltyRecord,
} from '@/components/admin/use-integrity-penalties'

const meta = {
  title: 'Design System/Components/Admin Integrity Penalties Table',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const penalty: IntegrityPenaltyRecord = {
  id: 'penalty-001',
  user_id: 'user-sanora',
  reason: 'voting_ring',
  source_flag_id: 'vote-flag-001',
  created_by_id: 'admin-morgan',
  revoked_at: null,
  revoked_by_id: null,
  created_at: '2026-06-05T17:40:00.000Z',
}

const confirmedRevokeState = {
  pages: [],
  hasNextPage: false,
  endCursor: null,
  loadMore: fn(async () => {}),
  loadingMore: false,
  fetchError: null,
  clearError: fn(),
  actionErrors: {},
  actionLoading: {},
  confirming: { [penalty.id]: true },
  handleRefresh: fn(),
  handleStatusChange: fn(),
  isPending: false,
  penalties: [penalty],
  reconcile: fn(async () => true),
  reconciliationRequired: {},
  resetKey: Symbol('integrity-penalties-pagination'),
  revokeWithConfirmation: fn(async () => {}),
  scopeAvailable: true,
  selectedStatus: 'active',
} satisfies IntegrityPenaltiesState<IntegrityPenaltyRecord>

export const VoteTable: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <IntegrityPenaltiesTable
        domain='vote'
        initialStatus='active'
        multiplier={() => '0.25×'}
        state={confirmedRevokeState}
      />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByRole('columnheader', { name: 'Multiplier' })).toBeVisible()
    await expect(canvas.getByText('0.25×')).toBeVisible()
  },
}

export const ReportTableWithoutMultiplier: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <IntegrityPenaltiesTable
        domain='report'
        initialStatus='active'
        multiplier={() => null}
        state={confirmedRevokeState}
      />
    </main>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('columnheader', { name: 'Multiplier' }),
    ).toBeNull()
  },
}

export const EmptyTable: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <IntegrityPenaltiesTable
        domain='vote'
        initialStatus='active'
        multiplier={() => null}
        state={{ ...confirmedRevokeState, penalties: [] }}
      />
    </main>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No penalties found')).toBeVisible()
  },
}
