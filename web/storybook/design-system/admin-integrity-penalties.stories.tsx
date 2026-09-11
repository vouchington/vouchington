import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { IntegrityPenaltiesHeader } from '@/components/admin/integrity-penalties-header'
import { IntegrityPenaltyRow } from '@/components/admin/integrity-penalty-row'
import type {
  IntegrityPenaltiesState,
  IntegrityPenaltyRecord,
} from '@/components/admin/use-integrity-penalties'

const meta = {
  title: 'Design System/Components/Admin Integrity Penalties',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const refreshPenalties = fn()
const changePenaltyStatus = fn()
const revokePenalty = fn(async () => {})
const reconcilePenalty = fn(async () => true)

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

const reconciliationState = {
  pages: [],
  hasNextPage: false,
  endCursor: null,
  loadMore: fn(async () => {}),
  loadingMore: false,
  fetchError: null,
  clearError: fn(),
  actionErrors: { [penalty.id]: 'The result needs confirmation.' },
  actionLoading: {},
  confirming: {},
  handleRefresh: fn(),
  handleStatusChange: fn(),
  isPending: false,
  penalties: [penalty],
  reconcile: reconcilePenalty,
  reconciliationRequired: { [penalty.id]: true },
  resetKey: Symbol('integrity-penalties-pagination'),
  revokeWithConfirmation: revokePenalty,
  scopeAvailable: true,
  selectedStatus: 'active',
} satisfies IntegrityPenaltiesState<IntegrityPenaltyRecord>

const confirmedRevokeState = {
  ...reconciliationState,
  actionErrors: {},
  confirming: { [penalty.id]: true },
  reconciliationRequired: {},
} satisfies IntegrityPenaltiesState<IntegrityPenaltyRecord>

function PenaltyTable({ state }: { state: IntegrityPenaltiesState<IntegrityPenaltyRecord> }) {
  return (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <table className='w-full'>
        <caption className='sr-only'>Vote integrity penalties</caption>
        <thead>
          <tr>
            {['User', 'Reason', 'Multiplier', 'Source flag', 'Created', 'State', 'Actions'].map(
              heading => (
                <th
                  key={heading}
                  scope='col'
                  className='px-4 py-3 text-left'
                >
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          <IntegrityPenaltyRow
            domain='vote'
            initialStatus='active'
            multiplier='0.25×'
            penalty={penalty}
            reconciliationTestId='storybook-penalty-reconciliation'
            revokeTestId='storybook-penalty-revoke'
            state={state}
          />
        </tbody>
      </table>
    </main>
  )
}

export const Header: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <IntegrityPenaltiesHeader
        domain='vote'
        flagsPath='/vote-integrity/flags'
        isPending={false}
        onRefresh={refreshPenalties}
        onStatusChange={changePenaltyStatus}
        penaltiesPath='/vote-integrity/penalties'
        selectedStatus='active'
        flagsTestId='storybook-vote-integrity-flags-tab'
        headingTestId='storybook-vote-integrity-penalties-heading'
        statusFilterTestId='storybook-vote-integrity-penalties-status-filter'
      />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByRole('heading', { name: 'Vote Integrity Penalties' })).toBeVisible()
    await expect(canvas.getByRole('link', { name: 'Flags' })).toHaveAttribute(
      'href',
      '/vote-integrity/flags',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh penalties' }))
    await expect(refreshPenalties).toHaveBeenCalled()
  },
}

export const RowRequiringReconciliation: Story = {
  render: () => <PenaltyTable state={reconciliationState} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByText('Voting ring')).toBeVisible()
    await expect(canvas.getByText('0.25×')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Revoke' })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Reload result' }))
    await expect(reconcilePenalty).toHaveBeenCalledWith(penalty.id)
  },
}

export const ActiveRowAwaitingRevokeConfirmation: Story = {
  render: () => <PenaltyTable state={confirmedRevokeState} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Confirm revoke' }))
    await expect(revokePenalty).toHaveBeenCalledWith(penalty.id)
  },
}
