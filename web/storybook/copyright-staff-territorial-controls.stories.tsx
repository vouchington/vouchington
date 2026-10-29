import { expect, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightStaffTerritorialComplaintReview } from '@/components/copyright/copyright-staff-territorial-complaint-review'
import { CopyrightStaffTerritorialImplementationFields } from '@/components/copyright/copyright-staff-territorial-dispute-implementation'
import { CopyrightStaffTerritorialSettlementRecord } from '@/components/copyright/copyright-staff-territorial-dispute-record'
import { CopyrightStaffTerritorialReferralFields } from '@/components/copyright/copyright-staff-territorial-dispute-referral'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'

const item = makeCopyrightStaffQueueItem({ jurisdiction: 'eu_dsa' })
export default { title: 'Copyright/Staff Territorial Controls' } satisfies Meta
export const Complaint: StoryObj = {
  render: () => (
    <CopyrightStaffTerritorialComplaintReview
      item={item}
      complaint={{
        id: 'complaint-1',
        filed_by: 'poster',
        submitted_by_id: 'poster-1',
        received_at: '2026-10-01T10:00:00Z',
        explanation: 'I have a license for this photograph.',
        informed_at: '2026-09-30T10:00:00Z',
        window_ends_at: '2027-03-30T10:00:00Z',
        decision: null,
      }}
      pending={false}
      onReview={() => undefined}
    />
  ),
}
export const Referral: StoryObj = {
  render: () => (
    <CopyrightStaffTerritorialReferralFields
      item={item}
      pending={false}
      onReview={() => undefined}
    />
  ),
}
export const Outcome: StoryObj = {
  render: () => (
    <CopyrightStaffTerritorialSettlementRecord
      item={item}
      referral={{
        id: 'referral-1',
        body_name: 'Example Dispute Body',
        referred_at: '2026-10-01T10:00:00Z',
        referred_by_party: 'poster',
        referred_by_id: 'poster-1',
        outcome: null,
      }}
      pending={false}
      onReview={() => undefined}
    />
  ),
}
export const Implementation: StoryObj = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Record implementation' }),
    ).toBeEnabled()
  },
  render: () => (
    <CopyrightStaffTerritorialImplementationFields
      implementedAt='2026-10-02T10:00'
      noticeId={item.id}
      referralId='referral-1'
      setImplementedAt={() => undefined}
      pending={false}
      onReview={() => undefined}
    />
  ),
}
