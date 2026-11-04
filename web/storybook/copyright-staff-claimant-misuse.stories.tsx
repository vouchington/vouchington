import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightStaffClaimantMisuse } from '@/components/copyright/copyright-staff-claimant-misuse'
import { makeBusyUsStaffCase } from '@/test-helpers/api-responses/copyright-staff-case'

const meta = {
  title: 'Copyright/Staff Claimant Misuse',
  component: CopyrightStaffClaimantMisuse,
} satisfies Meta<typeof CopyrightStaffClaimantMisuse>

export default meta
type Story = StoryObj<typeof meta>

const summary = makeBusyUsStaffCase().claimant.misuse!

export const OlderNoticesAvailable: Story = {
  args: {
    claimantUserId: 'claimant-1',
    misuse: {
      ...summary,
      notice_count: 1000,
      page_info: { has_next_page: true, start_cursor: 'first', end_cursor: 'next' },
    },
  },
}

export const NoAccount: Story = {
  args: { claimantUserId: null, misuse: null },
}

export const NoMisuseInWindow: Story = {
  args: {
    claimantUserId: 'claimant-1',
    misuse: {
      ...summary,
      notice_withdrawn: 0,
      notice_rejected: 0,
      restriction_reversed_by_counter_notice: 0,
      restriction_reversed_by_appeal: 0,
    },
  },
}
