import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AnnualPenaltyReviews } from '@/components/admin/annual-penalty-reviews'
import type { VoteIntegrityPenaltyReviewDue } from '@/types/vote-integrity'

const meta = {
  title: 'Design System/Components/Admin Annual Penalty Reviews',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const ring: VoteIntegrityPenaltyReviewDue = {
  id: '018f6763-0a71-752d-b657-a06cf00dd401',
  user_id: '018f6763-0a71-752d-b657-a06cf00dd402',
  user_username: 'review-recipient',
  penalty_multiplier: 0.25,
  reason: 'voting_ring',
  source_flag_id: '018f6763-0a71-752d-b657-a06cf00dd403',
  created_by_id: null,
  revoked_at: null,
  revoked_by_id: null,
  reviewed_at: null,
  reviewed_by_id: null,
  review_due_at: '2026-01-01T00:00:00Z',
  created_at: '2025-01-01T00:00:00Z',
}

const referral: VoteIntegrityPenaltyReviewDue = {
  ...ring,
  id: '018f6763-0a71-752d-b657-a06cf00dd404',
  reason: 'referral_link_in_post',
  source_flag_id: null,
}

const getDue = fn(async () => ({
  results: [ring, referral],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}))
const reconcile = fn<(id: string) => Promise<boolean>>(async () => true)
const review = fn(async (id: string) => ({ penalty: id === ring.id ? ring : referral }))
const revoke = fn(async (id: string) => ({ penalty: id === ring.id ? ring : referral }))

export const DueVotePenalties: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <AnnualPenaltyReviews
        reconcile={reconcile}
        initialDuePage={{
          results: [ring, referral],
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }}
        getDue={getDue}
        review={review}
        revoke={revoke}
      />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('referral_link_in_post')).toBeVisible()
    await expect(canvas.getByText('voting_ring')).toBeVisible()
    const revokeButtons = canvas.getAllByRole('button', { name: 'Revoke' })
    await userEvent.click(revokeButtons[1]!)
    await expect(canvas.getByRole('button', { name: 'Confirm revoke' })).toBeVisible()
    await expect(revoke).not.toHaveBeenCalled()
  },
}
